import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureProjectActive } from "@/lib/project-utils";
import { nextVoucherNumber } from "@/lib/voucher";
import { z } from "zod";

const transactionPatchSchema = z.object({
  type: z.enum(["BUY", "ISSUE", "RETURN", "ADJUST"]),
  quantity: z.coerce.number().min(0.01, "Quantity must be greater than 0"),
  unitCost: z.coerce.number().min(0),
  date: z.string(),
  note: z.string().optional(),
  vendorId: z.string().min(1).nullish(),
});

// Non-transfer transactions only affect this project's own balance. Buying,
// issuing or returning stock increments exactly one of these fields (ADJUST
// is treated the same as BUY, matching how it's applied on creation).
function balanceDelta(type: string, quantity: number) {
  return {
    qtyBought: type === "BUY" || type === "ADJUST" ? quantity : 0,
    qtyIssued: type === "ISSUE" ? quantity : 0,
    qtyReturned: type === "RETURN" ? quantity : 0,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; transactionId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: projectId, transactionId } = await params;
    const txn = await prisma.inventoryTransaction.findUnique({ where: { id: transactionId } });

    if (!txn || txn.projectId !== projectId) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    return NextResponse.json(txn);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch transaction" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; transactionId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: projectId, transactionId } = await params;
    await ensureProjectActive(projectId);

    const body = await request.json();
    const parsed = transactionPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const existing = await prisma.inventoryTransaction.findUnique({ where: { id: transactionId } });
    if (!existing || existing.projectId !== projectId) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    if (existing.type === "TRANSFER_IN" || existing.type === "TRANSFER_OUT") {
      return NextResponse.json(
        { error: "Transfers can't be edited directly. Record a new transfer instead." },
        { status: 400 },
      );
    }

    const { type, quantity, unitCost, date, note } = parsed.data;
    const vendorId = parsed.data.vendorId ?? null;
    const oldDelta = balanceDelta(existing.type, Number(existing.quantity));
    const newDelta = balanceDelta(type, quantity);

    if (vendorId) {
      const vendor = await prisma.contact.findUnique({ where: { id: vendorId }, select: { id: true } });
      if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Keep the vendor ledger entry in step: only a BUY with a vendor has one.
      let vendorTransactionId = existing.vendorTransactionId;
      const wantsLedger = type === "BUY" && !!vendorId;
      const item = await tx.item.findUnique({ where: { id: existing.itemId }, select: { name: true } });
      const description = `Inventory buy ${existing.voucherNumber}${item ? ` - ${item.name}` : ""}`;

      if (wantsLedger && vendorTransactionId) {
        await tx.vendorTransaction.update({
          where: { id: vendorTransactionId },
          data: { contactId: vendorId!, amount: quantity * unitCost, date: new Date(date), description },
        });
      } else if (wantsLedger) {
        const vtx = await tx.vendorTransaction.create({
          data: {
            contactId: vendorId!,
            projectId,
            type: "PURCHASE",
            amount: quantity * unitCost,
            date: new Date(date),
            description,
            voucherNumber: await nextVoucherNumber(tx, 'PUR', 'VENDOR_PUR'),
          },
        });
        vendorTransactionId = vtx.id;
      }

      const txn = await tx.inventoryTransaction.update({
        where: { id: transactionId },
        data: {
          type, quantity, unitCost, date: new Date(date), note, vendorId,
          vendorTransactionId: wantsLedger ? vendorTransactionId : null,
        },
      });

      if (!wantsLedger && vendorTransactionId) {
        await tx.vendorTransaction.delete({ where: { id: vendorTransactionId } });
      }

      await tx.projectInventory.update({
        where: { projectId_itemId: { projectId, itemId: existing.itemId } },
        data: {
          qtyBought: { increment: newDelta.qtyBought - oldDelta.qtyBought },
          qtyIssued: { increment: newDelta.qtyIssued - oldDelta.qtyIssued },
          qtyReturned: { increment: newDelta.qtyReturned - oldDelta.qtyReturned },
        },
      });
      return txn;
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.message.includes("CLOSED")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; transactionId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: projectId, transactionId } = await params;
    await ensureProjectActive(projectId);

    const existing = await prisma.inventoryTransaction.findUnique({ where: { id: transactionId } });
    if (!existing || existing.projectId !== projectId) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    if (existing.type === "TRANSFER_IN" || existing.type === "TRANSFER_OUT") {
      return NextResponse.json(
        { error: "Transfers can't be deleted directly. Record a reverse transfer instead." },
        { status: 400 },
      );
    }

    const delta = balanceDelta(existing.type, Number(existing.quantity));

    await prisma.$transaction(async (tx) => {
      await tx.inventoryTransaction.delete({ where: { id: transactionId } });
      if (existing.vendorTransactionId) {
        await tx.vendorTransaction.delete({ where: { id: existing.vendorTransactionId } });
      }
      await tx.projectInventory.update({
        where: { projectId_itemId: { projectId, itemId: existing.itemId } },
        data: {
          qtyBought: { increment: -delta.qtyBought },
          qtyIssued: { increment: -delta.qtyIssued },
          qtyReturned: { increment: -delta.qtyReturned },
        },
      });
    });

    return NextResponse.json({ id: transactionId });
  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.message.includes("CLOSED")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to delete transaction" }, { status: 500 });
  }
}
