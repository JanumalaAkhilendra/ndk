[NDK](../README.md) / [Exports](../modules.md) / NDKSubscriptionOptions

# Interface: NDKSubscriptionOptions

## Table of contents

### Properties

- [cacheUsage](NDKSubscriptionOptions.md#cacheusage)
- [closeOnEose](NDKSubscriptionOptions.md#closeoneose)
- [groupable](NDKSubscriptionOptions.md#groupable)
- [groupableDelay](NDKSubscriptionOptions.md#groupabledelay)
- [subId](NDKSubscriptionOptions.md#subid)

## Properties

### cacheUsage

• `Optional` **cacheUsage**: [`NDKSubscriptionCacheUsage`](../enums/NDKSubscriptionCacheUsage.md)

#### Defined in

[src/subscription/index.ts:32](https://github.com/nostr-dev-kit/ndk/blob/0aa26c2/src/subscription/index.ts#L32)

___

### closeOnEose

• **closeOnEose**: `boolean`

#### Defined in

[src/subscription/index.ts:31](https://github.com/nostr-dev-kit/ndk/blob/0aa26c2/src/subscription/index.ts#L31)

___

### groupable

• `Optional` **groupable**: `boolean`

Groupable subscriptions are created with a slight time
delayed to allow similar filters to be grouped together.

#### Defined in

[src/subscription/index.ts:38](https://github.com/nostr-dev-kit/ndk/blob/0aa26c2/src/subscription/index.ts#L38)

___

### groupableDelay

• `Optional` **groupableDelay**: `number`

The delay to use when grouping subscriptions, specified in milliseconds.

**`Default`**

```ts
100
```

#### Defined in

[src/subscription/index.ts:44](https://github.com/nostr-dev-kit/ndk/blob/0aa26c2/src/subscription/index.ts#L44)

___

### subId

• `Optional` **subId**: `string`

The subscription ID to use for the subscription.

#### Defined in

[src/subscription/index.ts:49](https://github.com/nostr-dev-kit/ndk/blob/0aa26c2/src/subscription/index.ts#L49)
