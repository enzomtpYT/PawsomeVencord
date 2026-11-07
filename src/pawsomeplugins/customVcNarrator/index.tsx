/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Devs, PawsomeDevs } from "@utils/constants";
import { Margins } from "@utils/margins";
import { wordsToTitle } from "@utils/text";
import definePlugin, { ReporterTestable } from "@utils/types";
import {
    ChannelStore,
    GuildMemberStore,
    SelectedChannelStore,
    SelectedGuildStore,
    useMemo,
    UserStore,
    VoiceStateStore
} from "@webpack/common";

import { queueNarration, stopPlaybackQueue } from "./audioQueue";
import { getCurrentVoice, settings } from "./settings";

interface VoiceState {
    userId: string;
    channelId?: string;
    oldChannelId?: string;
    deaf: boolean;
    mute: boolean;
    selfDeaf: boolean;
    selfMute: boolean;
}

function speak(text: string) {
    if (!text || text.trim().length === 0) return;

    const { volume, rate } = settings.store;
    const voice = getCurrentVoice();
    if (!voice) return;

    queueNarration(text, voice.id, volume, rate);
}

function clean(str: string) {
    const replacer = settings.store.latinOnly
        ? /[^\p{Script=Latin}\p{Number}\p{Punctuation}\s]/gu
        : /[^\p{Letter}\p{Number}\p{Punctuation}\s]/gu;

    return str.normalize("NFKC")
        .replace(replacer, "")
        .replace(/_{2,}/g, "_")
        .trim();
}

function formatText(str: string, user: string, channel: string, displayName: string, nickname: string) {
    return str
        .replaceAll("{{USER}}", clean(user) || (user ? "Someone" : ""))
        .replaceAll("{{CHANNEL}}", clean(channel) || "channel")
        .replaceAll("{{DISPLAY_NAME}}", clean(displayName) || clean(user) || "Someone")
        .replaceAll("{{NICKNAME}}", clean(nickname) || (nickname ? "Someone" : ""));
}

let myLastChannelId: string | undefined;

function getTypeAndChannelId({ channelId, oldChannelId }: VoiceState, isMe: boolean) {
    if (isMe && channelId !== myLastChannelId) {
        oldChannelId = myLastChannelId;
        myLastChannelId = channelId;
    }

    return channelId && oldChannelId
        ? ["move", channelId]
        : channelId
            ? ["join", channelId]
            : oldChannelId
                ? ["leave", oldChannelId]
                : [];
}

function playSample(type: string) {
    const currentUser = UserStore.getCurrentUser();
    const myGuildId = SelectedGuildStore.getGuildId();

    speak(formatText(
        settings.store[type + "Message"],
        currentUser.username,
        "general",
        currentUser.globalName ?? currentUser.username,
        GuildMemberStore.getNick(myGuildId!, currentUser.id) ?? currentUser.username
    ));
}

export default definePlugin({
    name: "CustomVcNarrator",
    description: "Announces when users join, leave, or move voice channels via narrator. TikTok TTS version; speechSynthesis is pretty boring",
    authors: [Devs.Ven, Devs.Nyako, Devs.Loukious, PawsomeDevs.enzomtp],
    reporterTestable: ReporterTestable.None,

    settings,

    stop() {
        stopPlaybackQueue();
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const myGuildId = SelectedGuildStore.getGuildId();
            const myChanId = SelectedChannelStore.getVoiceChannelId();
            const myId = UserStore.getCurrentUser().id;

            if (ChannelStore.getChannel(myChanId!)?.type === 13 /* Stage Channel */) return;

            for (const state of voiceStates) {
                const { userId, channelId, oldChannelId } = state;
                const isMe = userId === myId;
                if (!isMe) {
                    if (!myChanId) continue;
                    if (channelId !== myChanId && oldChannelId !== myChanId) continue;
                }

                const [type, id] = getTypeAndChannelId(state, isMe);
                if (!type) continue;

                const template = settings.store[type + "Message"];
                const userObj = UserStore.getUser(userId) as { username: string; globalName?: string; } | undefined;
                const user = isMe && !settings.store.sayOwnName ? "" : userObj?.username ?? "";
                const displayName = user && (userObj?.globalName ?? user);
                const nickname = user && (GuildMemberStore.getNick(myGuildId!, userId) ?? user);
                const channel = ChannelStore.getChannel(id).name;

                speak(formatText(template, user, channel, displayName, nickname));
            }
        },

        AUDIO_TOGGLE_SELF_MUTE() {
            const chanId = SelectedChannelStore.getVoiceChannelId()!;
            const s = VoiceStateStore.getVoiceStateForChannel(chanId) as VoiceState;
            if (!s) return;

            const event = s.mute || s.selfMute ? "unmute" : "mute";
            speak(formatText(settings.store[event + "Message"], "", ChannelStore.getChannel(chanId).name, "", ""));
        },

        AUDIO_TOGGLE_SELF_DEAF() {
            const chanId = SelectedChannelStore.getVoiceChannelId()!;
            const s = VoiceStateStore.getVoiceStateForChannel(chanId) as VoiceState;
            if (!s) return;

            const event = s.deaf || s.selfDeaf ? "undeafen" : "deafen";
            speak(formatText(settings.store[event + "Message"], "", ChannelStore.getChannel(chanId).name, "", ""));
        }
    },

    settingsAboutComponent() {
        const types = useMemo(
            () => Object.keys(settings.def).filter(k => k.endsWith("Message")).map(k => k.slice(0, -7)),
            [],
        );

        return (
            <section>
                <Paragraph>
                    You can customise the spoken messages below. You can disable specific messages by setting them to nothing.
                </Paragraph>
                <Paragraph>
                    The special placeholders <code>{"{{USER}}"}</code>, <code>{"{{DISPLAY_NAME}}"}</code>, <code>{"{{NICKNAME}}"}</code> and <code>{"{{CHANNEL}}"}</code>{" "}
                    will be replaced with the user's name (nothing if it's yourself), the user's display name, the user's nickname on current server and the channel's name respectively.
                </Paragraph>
                <Heading className={Margins.top20} tag="h3">Play Example Sounds</Heading>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: "1rem",
                    }}
                    className={"vc-narrator-buttons"}
                >
                    {types.map(t => (
                        <Button key={t} onClick={() => playSample(t)}>
                            {wordsToTitle([t])}
                        </Button>
                    ))}
                </div>
            </section>
        );
    }
});
