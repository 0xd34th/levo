export default interface Resources {
  "language": {
    "language": {
      "key": "Language",
      "value": "English"
    }
  },
  "translation": {
    "abstractAlert": {
      "buttonText": "Check the docs",
      "subtitle": "The Abstract Wallet only exist on Abstract. Don't use this address on any other blockchain, you will lose your funds.",
      "title": "This wallet only works on Abstract!"
    },
    "badge": {
      "updated": "Updated {{time}} ago"
    },
    "button": {
      "connectAnotherWallet": "Connect another wallet",
      "goBack": "Go back",
      "manageYourPosition": "Manage your position",
      "okay": "Okay"
    },
    "buttons": {
      "close": "Close",
      "deposit": "Deposit",
      "depositButtonLabel": "Quick deposit",
      "depositNow": "Deposit now",
      "managePositionsButtonLabel": "Manage positions",
      "requestRedeemButtonLabel": "Request redeem",
      "requestWithdraw": "Request withdraw",
      "withdraw": "Withdraw",
      "withdrawButtonLabel": "Withdraw"
    },
    "completedMissionsInformation": {
      "description": "As Jumper organize ad-hoc campaigns, the missions are updated on a monthly basis to create the associated graphics. Keep in mind: XP coming from specific campaigns will be updated on a monthly basis as well.",
      "title": ""
    },
    "contribution": {
      "confirm": "Confirm",
      "custom": "Custom",
      "description": "Show your appreciation by adding a contribution. 100% of it goes to improve Jumper.",
      "error": {
        "amountTooSmall": "The contribution amount is too small for this token. Please try a larger amount.",
        "errorSending": "Error sending contribution:",
        "invalidTokenPrice": "Invalid token price",
        "noFeeAddress": "No contribution fee address configured for this chain."
      },
      "thankYou": "Thank you!",
      "title": "Contribute"
    },
    "discordBanner": {
      "ctaButton": "Join our Discord",
      "ctaHeadline": "Join our Discord to learn more"
    },
    "error": {
      "message": "Something went wrong. Please try reloading the page. If the problem persists, contact our support."
    },
    "featureCard": {
      "learnMore": "Learn more"
    },
    "form": {
      "labels": {
        "amount": "Amount",
        "received": "Received",
        "requested": "Requested",
        "swap": "Swap",
        "withdrawTo": "Withdraw to"
      }
    },
    "format": {
      "currency": "{{value, currencyExt(currency: USD)}}",
      "currencyCompact": "{{value, currencyExt(currency: USD; notation: compact; compactDisplay: short)}}",
      "date": "{{value, dateExt(month: long)}}",
      "decimal": "{{value, decimalExt(maximumFractionDigits: 3)}}",
      "decimal2Digit": "{{value, decimalExt(maximumFractionDigits: 2)}}",
      "decimalCompact": "{{value, decimalExt(maximumFractionDigits: 3; notation: compact; compactDisplay: short)}}",
      "percent": "{{value, percentExt()}}",
      "shortDate": "{{value, dateExt(month: short)}}"
    },
    "jumperWidget": {
      "emptyList": "No {{itemsName}} available for selection",
      "fieldErrors": {
        "amount": {
          "max": "Amount must be at most {{max}}",
          "min": "Amount must be at least {{min}}",
          "overZero": "Amount must be greater than zero"
        },
        "balancesMultiSelect": {
          "max_one": "You can select {{count}} item maximum",
          "max_other": "You can select {{count}} items maximum"
        },
        "chainSingleSelect": {
          "notSupported": "Selected chain is not supported for this operation"
        },
        "numericSelect": {
          "max": "Value must be at most {{max}}",
          "min": "Value must be at least {{min}}"
        },
        "tokenChain": {
          "notSupported": "Token is not on a supported chain"
        },
        "tokenMultiSelect": {
          "max_one": "You can select up to {{count}} token",
          "max_other": "You can select up to {{count}} tokens",
          "min_one": "Please select at least {{count}} token",
          "min_other": "Please select at least {{count}} tokens",
          "notSupported": "One or more selected tokens are not supported"
        },
        "tokenSingleSelect": {
          "min": "Please select a token",
          "notSupported": "Selected token is not supported for this operation"
        }
      },
      "items": "items",
      "label": {
        "tokenCount_one": "{{count}} token on {{chainName}}",
        "tokenCount_other": "{{count}} tokens on {{chainName}}"
      },
      "placeholder": {
        "balancesMultiSelect": "Select tokens",
        "chainSingleSelect": "Select chain",
        "tokenMultiSelect": "Select tokens",
        "tokenSingleSelect": "Select token"
      }
    },
    "labels": {
      "apy": "APY",
      "assets_one": "Asset",
      "assets_other": "Assets",
      "assets_other_one": "Asset",
      "capInDollar": "Capacity",
      "category": "Category",
      "chains_one": "Chain",
      "chains_other": "Chains",
      "lockupPeriod": "Lockup Period",
      "overview": "Overview",
      "protocol": "Protocol",
      "rewardsApy": "Rewards APY",
      "tvl": "TVL"
    },
    "links": {
      "discover": "Discover {{name}}"
    },
    "modal": {
      "perks": {
        "claimedPerk": {
          "description": "You have verified this perk with the following address",
          "howToUsePerk": "How to use your perk ?",
          "howToUsePerkDescription": "Simply add the code we provide you in the checkout of the Nansen website.",
          "nextSteps": "Next steps",
          "title": "Perk claimed!"
        },
        "signatureFailed": {
          "description": "You need to sign the transaction to confirm ownership of the wallet address.",
          "title": "Signature required",
          "tryAgain": "Try again"
        },
        "stepper": {
          "continue": "Continue",
          "steps": {
            "email": {
              "description_one": "{{position}} you must first share your email address.",
              "description_other": "{{position}} you must share your email address.",
              "title": "Enter email"
            },
            "position": {
              "finally": "Finally",
              "first": "To claim your perk",
              "next": "Next"
            },
            "username": {
              "description_one": "{{position}} you must first share your {{usernameType}} username.",
              "description_other": "{{position}} you must share your {{usernameType}} username.",
              "title": "Enter username"
            },
            "wallet": {
              "description_one": "{{position}} you must sign a message to verify ownership of the below connected wallet address.",
              "description_other": "{{position}} you must sign a message to verify ownership of the below connected wallet address.",
              "title": "Verify wallet"
            }
          },
          "submit": "Verify wallet and claim perk",
          "submitting": "Waiting for verification"
        },
        "unclaimedPerk": {
          "title": "Claim perk"
        },
        "unknown": {
          "description": "An unknown error occurred. Please try again.",
          "title": "Unknown error",
          "tryAgain": "Try again"
        },
        "unsupportedWallet": {
          "description": "We don't support this wallet type. Please use a different wallet to complete this mission.",
          "switchWallet": "Switch wallet",
          "title": "Unsupported wallet"
        },
        "validationFailed": {
          "close": "Close",
          "description": "Please check the fields and try again.",
          "title": "Validation failed"
        }
      },
      "privateSwap": {
        "addressPlaceholder": "Recipient address",
        "confirm": "Confirm",
        "disclaimer1": "The address is correct and not an exchange wallet. Tokens sent to the wrong address can't be retrieved.",
        "disclaimer2": "This transaction is fulfilled by a centralized provider who might ask for KYC if it's flagged.",
        "paste": "Paste",
        "subtitle": "Set recipient address to keep it private.",
        "title": "You're going Incognito"
      }
    },
    "multisig": {
      "connected": {
        "description": "Please notify other wallet participants to be ready to sign.",
        "title": "Multisig wallet connected"
      },
      "transactionInitiated": {
        "description": "Please notify other multisig wallet participants to sign before the transaction expires.",
        "title": "Multiple signatures required"
      }
    },
    "navbar": {
      "connect": "Connect",
      "developers": {
        "documentation": "Documentation",
        "github": "GitHub"
      },
      "links": {
        "back": "Back",
        "buy": "Buy",
        "dashboard": "Dashboard",
        "exchange": "Exchange"
      },
      "navbarMenu": {
        "brandAssets": "Brand Assets",
        "developers": "Developers",
        "privacyPolicy": "Privacy Policy",
        "profile": "Profile",
        "resources": "Resources",
        "support": "Support",
        "termsOfBusiness": "Terms Of Business",
        "theme": "Theme"
      },
      "seeAllWallets": "See all wallets",
      "statsCards": {
        "bridges": "Bridges",
        "chains": "Chains",
        "dexs": "DEXs"
      },
      "themes": {
        "dark": "Dark",
        "darkModeDisabled": "Dark mode is disabled for this theme",
        "default": "Default",
        "light": "Light",
        "lightModeDisabled": "Light mode is disabled for this theme",
        "switchToDark": "Switch to dark mode",
        "switchToLight": "Switch to light mode",
        "switchToSystem": "Switch to system mode",
        "system": "System",
        "systemModeDisabled": "System mode is disabled for this theme"
      },
      "walletMenu": {
        "chains": "Chains",
        "connectAnotherWallet": "Connect another wallet",
        "copiedMsg": "Copied",
        "copy": "Copy",
        "disconnect": "Disconnect",
        "explore": "Explore",
        "numberOfChains": "{{numberOfChains}} chains",
        "refreshBalances": "Refresh balances",
        "switchChain": "Switch Chain",
        "totalBalance": "Total balance",
        "totalBalanceRefresh": "Click here to restart the indexing of your tokens now.",
        "totalBalanceTooltip": "Your total balance may not always be accurate due to potential indexing issues. We're on it!",
        "walletBalance": "Wallet balance",
        "walletNotInstalled": "{{wallet}} is not installed"
      },
      "walletSelectMenu": {
        "connectWallet": "Connect a wallet",
        "ecosystemSelectMenu": {
          "noEcosystemAdapter": "No appropriate ecosystem adapter found",
          "selectEcosystem": "Select wallet ecosystem"
        },
        "wallets": "Wallets"
      },
      "wallets": "Wallets",
      "welcome": {
        "cta": "Get started",
        "subtitle": "<0>4x audited</0> multi-chain liquidity aggregator",
        "title": "Find the best route"
      }
    },
    "notifications": {
      "aria": {
        "deleteNotification": "Delete notification",
        "openPanel": "Notifications"
      },
      "categories": {
        "all": "All Categories",
        "campaign": "Campaign",
        "earn": "Earn",
        "portfolio": "Portfolio",
        "product": "Product"
      },
      "dateFilter": {
        "all": "All Time",
        "month": "Past Month",
        "today": "Today",
        "week": "Past Week"
      },
      "emptyState": "No notifications",
      "title": "Notifications",
      "unread_one": "{{count}} unread notification",
      "unread_other": "{{count}} unread notifications",
      "unread_zero": "No unread notifications"
    },
    "promo": {
      "new": "New"
    },
    "search": {
      "filteredResult_one": "{{filterCount}} of {{count}} result",
      "filteredResult_other": "{{filterCount}} of {{count}} results",
      "noResults": "No results found",
      "placeholder": "Search...",
      "result_one": "{{count}} result",
      "result_other": "{{count}} results"
    },
    "seiAlert": {
      "buttonText": "Link Wallet",
      "subtitle": "To use SEI EVM, you need to link your wallet address to the SEI ecosystem.",
      "title": "Linking of SEI EVM wallet required"
    },
    "solanaAlert": {
      "subtitle": "Currently only USDC and USDT can be bridged to and from Solana.",
      "title": "Limited Solana token support"
    },
    "tooltips": {
      "apy": "Expected yearly return rate of the tokens invested.",
      "assets_one": "The asset you will earn from",
      "assets_other": "The assets you will earn from",
      "assets_other_one": "The asset you will earn from",
      "boostedApy": "{{baseApy}}% is the expected yearly return rate of the underlying tokens invested. The extra {{boostedApy}}% in rewards - distributed in another token - are paid exclusively to the participant of this zap campaign.",
      "capInDollar": "Available liquidity capacity of the market",
      "chains_one": "The chain you will earn from",
      "chains_other": "The chains you will earn from",
      "close": "Close",
      "deposit": "The token on which the market is defined and yield accrues on.",
      "depositDisabled": "Deposit currently disabled for this opportunity. <0>Go to {{protocolName}}</0>",
      "deposited": "The token you have deposited into this market.",
      "exitFullscreen": "Exit fullscreen",
      "fullscreen": "Fullscreen",
      "lockupPeriod": "Once deposited, your position is subject to an {{formattedLockupPeriod}} lock-up period before you can withdraw the funds.",
      "manageYourPosition": "You can also manage your funds (withdraw, check PNL) on {{partnerName}} UI by clicking on this button",
      "noPositionsToManage": "You do not have any positions to manage",
      "protocol": "The protocol you will earn from",
      "rewardsApy": "Expected yearly return rate distributed in reward token.",
      "tvl": "Total value of crypto assets deposited in this market.",
      "withdrawDisabled": "Withdraw currently disabled for this opportunity. <0>Go to {{protocolName}}</0>",
      "zoomIn": "Zoom in",
      "zoomOut": "Zoom out"
    },
    "widget": {
      "deposit": {
        "title": "Quick deposit"
      },
      "depositCard": {
        "apy": "Base APR",
        "boostedApy": "Boosted APR",
        "lockupPeriod": "Lockup period",
        "token": "Asset",
        "tvl": "TVL"
      },
      "earn": {
        "depositSuccess": "You will be able to see and manage your position in a few seconds by clicking on <bold>Manage your positions</bold>"
      },
      "exchange": {
        "title": "Exchange"
      },
      "swapBridge": {
        "title": "Swap & Bridge"
      },
      "withdraw": {
        "title": "Withdraw"
      },
      "zap": {
        "depositSuccess": "You will be able to see your position in a few seconds or alternatively by clicking on <bold>Manage your position</bold> that redirects to {{partnerName}} UI",
        "placeholder": {
          "comingSoon": "Coming soon",
          "non-evm": {
            "description": "We are working on adding support for non-EVM wallets. In the meantime please use an EVM wallet to execute transactions.",
            "title": "Your wallet is currently not supported"
          },
          "not-supported": {
            "description": "Please use an <strong>{{type}} wallet</strong> to execute transactions for this opportunity.",
            "title": "Your wallet is currently not supported"
          }
        },
        "sendToAddressName": "Deposit into {{name}}",
        "sentToAddressName": "Deposited into {{name}}",
        "tabs": {
          "deposit": "Deposit",
          "withdraw": "Withdraw"
        }
      }
    }
  }
}
