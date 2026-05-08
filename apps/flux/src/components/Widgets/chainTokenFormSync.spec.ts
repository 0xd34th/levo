import type { FormFieldChanged } from '@lifi/widget';
import { ChainId } from '@lifi/widget';
import { describe, expect, it } from 'vitest';
import {
  applyChainTokenFormFieldChange,
  createChainTokenFormDraft,
} from './chainTokenFormSync';

type DefinedFormFieldChanged = NonNullable<FormFieldChanged>;

const fieldChange = (
  fieldName: DefinedFormFieldChanged['fieldName'],
  newValue: DefinedFormFieldChanged['newValue'],
): FormFieldChanged =>
  ({
    fieldName,
    newValue,
    oldValue: undefined,
  }) as FormFieldChanged;

describe('chainTokenFormSync', () => {
  it('emits a source selection once form changes include both chain and token', () => {
    const draft = createChainTokenFormDraft();

    expect(
      applyChainTokenFormFieldChange(
        draft,
        fieldChange('fromChain', ChainId.SEI),
      ),
    ).toEqual({});

    expect(
      applyChainTokenFormFieldChange(draft, fieldChange('fromToken', 'usei')),
    ).toEqual({
      source: {
        chainId: ChainId.SEI,
        tokenAddress: 'usei',
      },
    });
  });

  it('uses an existing chain when only the token field changes', () => {
    const draft = createChainTokenFormDraft({
      source: {
        chainId: ChainId.SOL,
        tokenAddress: 'old-sol-token',
      },
    });

    expect(
      applyChainTokenFormFieldChange(
        draft,
        fieldChange('fromToken', 'new-sol-token'),
      ),
    ).toEqual({
      source: {
        chainId: ChainId.SOL,
        tokenAddress: 'new-sol-token',
      },
    });
  });

  it('does not pair a newly changed chain with the previous token', () => {
    const draft = createChainTokenFormDraft({
      destination: {
        chainId: ChainId.ETH,
        tokenAddress: 'old-eth-token',
      },
    });

    expect(
      applyChainTokenFormFieldChange(
        draft,
        fieldChange('toChain', ChainId.SUI),
      ),
    ).toEqual({});

    expect(
      applyChainTokenFormFieldChange(draft, fieldChange('toToken', '0xsui')),
    ).toEqual({
      destination: {
        chainId: ChainId.SUI,
        tokenAddress: '0xsui',
      },
    });
  });
});
