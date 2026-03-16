X Handle Payments on Sui — "Send to anyone, even if they're not on Sui yet"
Core Concept
A Cash App-style payments layer on Sui where you send stablecoins to any X (Twitter) handle — not a wallet address. The recipient doesn't need to have a Sui wallet at the time of sending. When they're ready, they claim it.
How It Works (Technical)
The magic is deterministic wallet derivation from an X handle using Nautilus:

Sender types @username + amount in the UI
The app derives a deterministic Sui address from that X handle (same input always → same address, reproducibly, trustlessly)
Funds are sent to that address on Sui (free stable txs + private txs once those ship)
Recipient later comes to the app, authenticates with X (OAuth/zkLogin), and the app re-derives their wallet from their handle — they can immediately claim/use the funds
No one else can claim it because only the X handle owner can authenticate and sign

Why This Is Interesting

Zero friction for the sender — you already know someone's X handle, you don't need to ask for a wallet address
Solves cold-start for new users — money can arrive in "your" wallet before you even create one, acting as a natural onboarding hook ("you have $12 waiting for you on Sui")
Sui-native advantages: near-zero fees, upcoming private transactions (Seal/ZK), fast finality

UX Flow
Send screen:
  [ @handle or search X ]  [ $amount ]  [ memo? ]
  → "Send $20 to @death_xyz"
  → confirms → done

Claim screen (for new users):
  "You have funds waiting"
  → Sign in with X
  → Wallet auto-derived → funds accessible
