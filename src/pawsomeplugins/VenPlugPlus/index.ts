/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs, EquicordDevs, PawsomeDevs } from "@utils/constants";
import definePlugin from "@utils/types";

import { handleConnection, handleDisconnection } from "./client";
import { getCommands } from "./commands";
import { handleMessage } from "./handlers";
import { setRpc, startRpcTimer, stopRpcTimer } from "./rpc";
import { setReconnectHandler, settings, updateCachedSettings } from "./settings";
import { ActivityType, FluxMessageCreate } from "./types";

export default definePlugin({
    name: "VenPlugPlus",
    description: "Detects words in messages and uses them to control a buttplug device",
    authors: [EquicordDevs.KaydaFox, EquicordDevs.danthebitshifter, Devs.Mopi, PawsomeDevs.enzomtp],
    settings,
    dependencies: ["CommandsAPI"],

    async start() {
        setReconnectHandler(async () => {
            await handleDisconnection();
            await handleConnection();
        });

        updateCachedSettings();
        startRpcTimer();

        setRpc({
            appName: settings.store.richPresenceTitle,
            details: "VenPlugPlus just started!",
            state: "Starting up...",
            type: ActivityType.PLAYING,
            imageBig: "1225879839622299748",
        });

        if (settings.store.connectAutomatically) {
            await handleConnection();
        }
    },

    stop() {
        stopRpcTimer();
        handleDisconnection();
        setRpc({});
    },

    flux: {
        MESSAGE_CREATE: (payload: FluxMessageCreate) => {
            handleMessage(payload.message);
        },
    },

    commands: getCommands()
});
