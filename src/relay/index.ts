import EventEmitter from "eventemitter3";
import type { Event as SignedEvent } from "nostr-tools";
import { relayInit, Sub } from "nostr-tools";
import "websocket-polyfill";
import NDKEvent, { NostrEvent } from "../events/index.js";
import { NDKSubscription } from "../subscription/index.js";
import User from "../user/index.js";
import { NDKRelayScore } from "./score.js";
import debug from "debug";

/**
 * The current status of a relay.
 */
export enum NDKRelayStatus {
    /**
     * The relay is attempting to connect.
     */
    CONNECTING,
    /**
     * The relay is connected.
     */
    CONNECTED,
    /**
     * The relay is attempting to disconnect.
     */
    DISCONNECTING,
    /**
     * The relay has disconnected.
     */
    DISCONNECTED,
    /**
     * The relay is attempting to reconnect.
     */
    RECONNECTING,
    /**
     * The relay is having issues responding.
     */
    FLAPPING
}

/**
 * The NDKRelayConnectionStats interface holds basic stats about a relay connection.
 */
export interface NDKRelayConnectionStats {
    /**
     * The number of times a connection has been attempted.
     */
    attempts: number;

    /**
     * The number of times a connection has been successfully established.
     */
    success: number;

    /**
     * The durations of the last 100 connections in milliseconds.
     */
    durations: number[];

    /**
     * The time the current connection was established in milliseconds.
     */
    connectedAt?: number;
}

/**
 * The NDKRelay class represents a connection to a relay.
 *
 * @emits NDKRelay#connect
 * @emits NDKRelay#disconnect
 * @emits NDKRelay#notice
 * @emits NDKRelay#event
 * @emits NDKRelay#eose
 */
export class NDKRelay extends EventEmitter {
    readonly url: string;
    readonly scores: Map<User, NDKRelayScore>;
    private relay;
    private _status: NDKRelayStatus;
    private connectedAt?: number;
    private _connectionStats: NDKRelayConnectionStats = { attempts: 0, success: 0, durations: [] };
    public complaining = false;
    private debug: debug.Debugger;

    /**
     * Active subscriptions this relay is connected to
     */
    public activeSubscriptions = new Set<NDKSubscription>();

    public constructor(url: string) {
        super();
        this.url = url;
        this.relay = relayInit(url);
        this.scores = new Map<User, NDKRelayScore>();
        this._status = NDKRelayStatus.DISCONNECTED;
        this.debug = debug(`ndk:relay:${url}`);

        this.relay.on("connect", () => {
            this.updateConnectionStats.connected();
            this.emit("connect");
            this._status = NDKRelayStatus.CONNECTED;
        });

        this.relay.on("disconnect", () => {
            this.updateConnectionStats.disconnected();
            this.emit("disconnect");

            if (this._status === NDKRelayStatus.CONNECTED) {
                this._status = NDKRelayStatus.DISCONNECTED;

                this.handleReconnection();
            }
        });

        this.relay.on("notice", (notice: string) => this.handleNotice(notice));
    }

    /**
     * Evaluates the connection stats to determine if the relay is flapping.
     * @returns Boolean value whether the relay is flapping or not.
     */
    private isFlapping(): boolean {
        const durations = this._connectionStats.durations;
        if (durations.length < 10) return false;

        const sum = durations.reduce((a, b) => a + b, 0);
        const avg = sum / durations.length;
        const variance =
            durations.map((x) => Math.pow(x - avg, 2)).reduce((a, b) => a + b, 0) /
            durations.length;
        const stdDev = Math.sqrt(variance);
        const isFlapping = stdDev < 1000;

        return isFlapping;
    }

    /**
     * Called when the relay is unexpectedly disconnected.
     */
    private handleReconnection() {
        if (this.isFlapping()) {
            this.emit("flapping", this, this._connectionStats);
            this._status = NDKRelayStatus.FLAPPING;
        }

        if (this.connectedAt && Date.now() - this.connectedAt < 5000) {
            setTimeout(() => this.connect(), 60000);
        } else {
            this.connect();
        }
    }

    /**
     * Returns the current status of the relay.
     * @returns NDKRelayStatus enum
     */
    get status(): NDKRelayStatus {
        return this._status;
    }

    /**
     * Returns the connection stats.
     * @returns NDKRelayConnectionStats object
     */
    get connectionStats(): NDKRelayConnectionStats {
        return this._connectionStats;
    }

    /**
     * Connects to the relay.
     * @returns Promise<void>
     */
    public async connect(): Promise<void> {
        try {
            this.updateConnectionStats.attempt();
            this._status = NDKRelayStatus.CONNECTING;
            await this.relay.connect();
        } catch (e) {
            this.debug("Failed to connect", e);
            this._status = NDKRelayStatus.DISCONNECTED;
            throw e;
        }
    }

    /**
     * Disconnects from the relay.
     * @returns void
     */
    public disconnect(): void {
        this._status = NDKRelayStatus.DISCONNECTING;
        this.relay.close();
    }

    /**
     * Handles notices returned by relays.
     * @param notice The notice string returned from a relay
     * @returns Promise<void>
     */
    async handleNotice(notice: string): Promise<void> {
        // This is a prototype; if the relay seems to be complaining
        // remove it from relay set selection for a minute.
        if (notice.includes("oo many") || notice.includes("aximum")) {
            this.disconnect();
            setTimeout(() => this.connect(), 2000);
            console.log(this.relay.url, "Relay complaining?", notice);
            // this.complaining = true;
            // setTimeout(() => {
            //     this.complaining = false;
            //     console.log(this.relay.url, 'Reactivate relay');
            // }, 60000);
        }

        this.emit("notice", this, notice);
    }

    /**
     * Subscribes to an NDKSubscription.
     * @param subscription The NDKSubscription to subscribe to.
     * @retuns nostr-tools subscription object
     */
    public subscribe(subscription: NDKSubscription): Sub {
        const { filter } = subscription;

        const sub = this.relay.sub([filter], {
            id: subscription.subId
        });
        this.debug(`Subscribed to ${JSON.stringify(filter)}`);

        sub.on("event", (event: NostrEvent) => {
            const e = new NDKEvent(undefined, event);
            e.relay = this;
            subscription.eventReceived(e, this);
        });

        sub.on("eose", () => {
            subscription.eoseReceived(this);
        });

        const unsub = sub.unsub;
        sub.unsub = () => {
            this.debug(`Unsubscribing from ${JSON.stringify(filter)}`);
            this.activeSubscriptions.delete(subscription);
            unsub();
        };

        this.activeSubscriptions.add(subscription);
        subscription.on("close", () => {
            this.activeSubscriptions.delete(subscription);
        });

        return sub;
    }

    /**
     * Publishes an event to the relay.
     * @param event The NDKEvent to be published
     * @returns Promise<void>
     */
    public async publish(event: NDKEvent): Promise<void> {
        const nostrEvent = (await event.toNostrEvent()) as SignedEvent;
        const a = this.relay.publish(nostrEvent);
        a.on("failed", (err: any) => {
            this.debug("Publish failed", err, event.rawEvent());
        });

        a.on("ok", () => {
            this.debug("Publish ok", event.rawEvent());
        });

        this.debug(`Published event ${event.id}`, event.rawEvent());
    }

    /**
     * Called when this relay has responded with an event but
     * wasn't the fastest one.
     * @param timeDiffInMs The time difference in ms between the fastest and this relay in milliseconds
     * @returns void
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public scoreSlowerEvent(timeDiffInMs: number): void {
        // TODO
    }

    /**
     * Utility functions to update the connection stats.
     */
    private updateConnectionStats = {
        connected: () => {
            this._connectionStats.success++;
            this._connectionStats.connectedAt = Date.now();
        },

        disconnected: () => {
            if (this._connectionStats.connectedAt) {
                this._connectionStats.durations.push(
                    Date.now() - this._connectionStats.connectedAt
                );

                if (this._connectionStats.durations.length > 100) {
                    this._connectionStats.durations.shift();
                }
            }
            this._connectionStats.connectedAt = undefined;
        },

        attempt: () => {
            this._connectionStats.attempts++;
        }
    };
}
