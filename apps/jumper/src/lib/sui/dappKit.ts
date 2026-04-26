"use client";

import { createDAppKit } from "@mysten/dapp-kit-react";
import { getSuiClient } from "./client";

export const dAppKit = createDAppKit({
  createClient: () => getSuiClient(),
  networks: ["mainnet"],
  slushWalletConfig: {
    appName: "Jumper",
  },
});
