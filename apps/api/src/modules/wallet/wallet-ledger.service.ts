import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { LedgerEntryType, Prisma } from "@prisma/client";

interface LedgerPostInput {
  walletId: string;
  userId: string;
  type: LedgerEntryType;
  availableDeltaMinor: bigint;
  escrowDeltaMinor: bigint;
  referenceType?: string;
  referenceId?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class WalletLedgerService {
  async postEntry(tx: Prisma.TransactionClient, input: LedgerPostInput) {
    await tx.$queryRaw`SELECT "id" FROM "Wallet" WHERE "id" = ${input.walletId} FOR UPDATE`;

    const wallet = await tx.wallet.findUnique({ where: { id: input.walletId } });

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    const nextAvailable = wallet.availableBalanceMinor + input.availableDeltaMinor;
    const nextEscrow = wallet.escrowBalanceMinor + input.escrowDeltaMinor;

    if (nextAvailable < BigInt(0) || nextEscrow < BigInt(0)) {
      throw new BadRequestException("Insufficient wallet balance for operation");
    }

    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalanceMinor: nextAvailable,
        escrowBalanceMinor: nextEscrow,
      },
    });

    return tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        userId: input.userId,
        type: input.type,
        availableDeltaMinor: input.availableDeltaMinor,
        escrowDeltaMinor: input.escrowDeltaMinor,
        balanceAfterAvailableMinor: nextAvailable,
        balanceAfterEscrowMinor: nextEscrow,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        metadata: input.metadata,
      },
    });
  }
}
