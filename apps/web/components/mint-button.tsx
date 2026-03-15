'use client';

import { useEffect, useRef, useState } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useDAppKit, useCurrentAccount } from '@mysten/dapp-kit-react';
import { Button } from '@/components/ui/button';

interface MintButtonProps {
  packageId: string;
  treasuryCapId: string;
}

const MINT_AMOUNT = BigInt('10000000'); // 10 TUSDC (6 decimals)

export function MintButton({ packageId, treasuryCapId }: MintButtonProps) {
  const [minting, setMinting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();

  useEffect(() => {
    setResult(null);
  }, [account?.address]);

  const handleMint = async () => {
    if (!account || inFlightRef.current) return;

    inFlightRef.current = true;
    setMinting(true);
    setResult(null);

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${packageId}::test_usdc::mint`,
        arguments: [
          tx.object(treasuryCapId),
          tx.pure.u64(MINT_AMOUNT),
          tx.pure.address(account.address),
        ],
      });

      const res = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (res.$kind === 'FailedTransaction') {
        setResult('Mint transaction failed on-chain');
        return;
      }
      setResult('Minted 10 TUSDC');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mint failed';
      setResult(message);
    } finally {
      inFlightRef.current = false;
      setMinting(false);
    }
  };

  if (!account) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleMint}
        disabled={minting}
      >
        {minting ? 'Minting...' : 'Mint 10 TUSDC'}
      </Button>
      {result && (
        <span className="max-w-40 truncate text-xs text-muted-foreground">
          {result}
        </span>
      )}
    </div>
  );
}
