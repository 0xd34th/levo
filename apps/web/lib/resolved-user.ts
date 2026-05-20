export type ResolvedUserPreview = {
  username: string;
  profilePicture: string | null;
  isBlueVerified: boolean;
  recipientAddress: string;
};

export type ResolvedAddressPreview = {
  recipientAddress: string;
};

export type RecipientPreview =
  | ({ recipientType: 'X_HANDLE' } & ResolvedUserPreview)
  | ({ recipientType: 'SUI_ADDRESS' } & ResolvedAddressPreview);
