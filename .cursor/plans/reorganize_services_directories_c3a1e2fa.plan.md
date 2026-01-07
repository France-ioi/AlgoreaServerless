---
name: Reorganize Services Directories
overview: Rename services/ to handlers/ in both forum and portal modules for consistency, and move Stripe-specific utilities to lib/stripe/ in portal.
todos:
  - id: forum-rename
    content: Rename src/forum/services/ to src/forum/handlers/ and update imports
    status: completed
  - id: portal-handlers
    content: Create src/portal/handlers/ with entry-state and checkout-session handler
    status: completed
  - id: portal-lib-stripe
    content: Create src/portal/lib/stripe/ and move Stripe utilities (remove stripe- prefix)
    status: completed
  - id: update-imports
    content: Update all import paths in routes.ts and handler files
    status: completed
    dependencies:
      - forum-rename
      - portal-handlers
      - portal-lib-stripe
  - id: update-architecture
    content: Update ARCHITECTURE.md to reflect new directory structure
    status: completed
    dependencies:
      - update-imports
  - id: todo-1767780173030-2n8dmhm0a
    content: Ensure all tests + lint are still passing
    status: completed
---

# Reorganize Services to Handlers + lib/stripe/

Standardize directory naming: `services/` becomes `handlers/` for HTTP/WebSocket handlers, and Stripe utilities move to `lib/stripe/`.

## Target Structure

```
src/forum/
  ├── handlers/              # renamed from services/
  │   ├── messages.ts
  │   ├── messages.spec.ts
  │   ├── thread-subscription.ts
  │   └── thread-subscription.spec.ts
  └── routes.ts

src/portal/
  ├── handlers/              # renamed from services/
  │   ├── checkout-session.ts      # renamed from checkout-session-handler.ts
  │   ├── checkout-session.spec.ts
  │   ├── entry-state.ts
  │   └── entry-state.spec.ts
  ├── lib/
  │   └── stripe/            # Stripe API wrappers
  │       ├── checkout-session.ts
  │       ├── checkout-session.spec.ts
  │       ├── customer.ts           # renamed from stripe-customer.ts
  │       ├── customer.spec.ts
  │       ├── invoice.ts            # renamed from stripe-invoice.ts
  │       ├── invoice.spec.ts
  │       ├── price.ts              # renamed from stripe-price.ts
  │       └── price.spec.ts
  └── routes.ts
```

## Key Changes

1. **Forum module**: Rename `services/` to `handlers/`
2. **Portal module**: 

   - Rename `services/` to `handlers/` (keep only entry-state and checkout-session handler)
   - Create `lib/stripe/` for Stripe wrappers
   - Remove `stripe-` prefix from utility files (redundant with directory name)
   - Rename `checkout-session-handler.ts` to just `checkout-session.ts` (the `-handler` suffix becomes unnecessary)

## Files to Update

| Current Path | New Path |

|--------------|----------|

| `src/forum/services/*` | `src/forum/handlers/*` |

| `src/portal/services/entry-state.ts` | `src/portal/handlers/entry-state.ts` |

| `src/portal/services/checkout-session-handler.ts` | `src/portal/handlers/checkout-session.ts` |

| `src/portal/services/checkout-session.ts` | `src/portal/lib/stripe/checkout-session.ts` |

| `src/portal/services/stripe-customer.ts` | `src/portal/lib/stripe/customer.ts` |

| `src/portal/services/stripe-invoice.ts` | `src/portal/lib/stripe/invoice.ts` |

| `src/portal/services/stripe-price.ts` | `src/portal/lib/stripe/price.ts` |

## Import Updates Required

- [routes.ts](src/forum/routes.ts): Update imports from `./services/` to `./handlers/`
- [routes.ts](src/portal/routes.ts): Update imports from `./services/` to `./handlers/`
- [checkout-session.ts (handler)](src/portal/services/checkout-session-handler.ts): Update imports to `../lib/stripe/`
- [entry-state.ts](src/portal/services/entry-state.ts): Update imports to `../lib/stripe/`
- Update [ARCHITECTURE.md](ARCHITECTURE.md) to reflect new structure
