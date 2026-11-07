/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs, EquicordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, SelectedChannelStore, UserStore } from "@webpack/common";

import { START_SOUND, STOP_SOUND } from "./sounds";

const videoStates = new Map<string, boolean>();

function playNotification(isVideoOn: boolean) {
    try {
        const audio = new Audio(isVideoOn ? START_SOUND : STOP_SOUND);
        audio.volume = Math.max(0, Math.min(100, settings.store.volume ?? 100)) / 100;
        audio.play().catch(() => {});
    } catch {
        // Audio playback error handling
    }
}

const settings = definePluginSettings({
    playInPrivate: {
        type: OptionType.BOOLEAN,
        description: "Play notification sound in private voice calls (DMs)",
        default: true
    },
    playInServer: {
        type: OptionType.BOOLEAN,
        description: "Play notification sound in server voice channels",
        default: true
    },
    volume: {
        type: OptionType.SLIDER,
        description: "Notification sound volume",
        markers: [10, 25, 50, 75, 100],
        default: 100,
        stickToMarkers: false
    }
});

export default definePlugin({
    name: "WebcamStartNotifier",
    description: "Plays a sound when someone starts/stops their webcam in a voice channel",
    authors: [Devs.redbaron2k7, EquicordDevs.enzomtp],
    settings,

    stop() {
        videoStates.clear();
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: Array<{ userId: string; channelId: string; selfVideo?: boolean; }>; }) {
            const currentChannelId = SelectedChannelStore.getVoiceChannelId();
            if (!currentChannelId) return;

            const currentChannel = ChannelStore.getChannel(currentChannelId);
            if (!currentChannel) return;

            const isPrivateChannel = currentChannel.type === 1 || currentChannel.type === 3;

            if ((isPrivateChannel && !settings.store.playInPrivate) ||
                (!isPrivateChannel && !settings.store.playInServer)) {
                return;
            }

            const currentUserId = UserStore.getCurrentUser()?.id;

            voiceStates.forEach(state => {
                if (state.channelId !== currentChannelId || state.userId === currentUserId) return;

                const prevVideoState = videoStates.get(state.userId);
                if (state.selfVideo !== undefined && prevVideoState !== undefined && prevVideoState !== state.selfVideo) {
                    playNotification(state.selfVideo);
                }
                videoStates.set(state.userId, state.selfVideo ?? false);
            });
        },
        VOICE_CHANNEL_SELECT() {
            videoStates.clear();
        }
    }
});
