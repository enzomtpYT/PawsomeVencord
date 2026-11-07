/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

import type { ServerProfilePreset } from "./types";

export interface PendingProfileSetters {
    setPendingNickname(nick: string | null): void;
    setPendingPronouns(pronouns: string | null): void;
    setPendingBio(bio: string | null): void;
    setPendingThemeColors(colors: number[] | undefined): void;
    setPendingBanner(banner: string | undefined): void;
    setPendingAvatar(avatar: string | undefined): void;
    setPendingProfileEffectId(id: string | undefined): void;
    setPendingAvatarDecoration(id: string | undefined): void;
}

export const PendingProfileActions = findByPropsLazy(
    "setPendingNickname",
    "setPendingPronouns"
) as unknown as PendingProfileSetters;

export function applyPresetValues(preset: Partial<ServerProfilePreset>, isNitro: boolean, guildId?: string) {
    const payload: Record<string, unknown> = {
        pendingNickname: preset.nick ?? null,
        pendingPronouns: preset.pronouns ?? ""
    };

    if (isNitro) {
        payload.pendingBio = preset.bio ?? null;
        payload.pendingThemeColors = preset.themeColors;
        payload.pendingBanner = preset.banner;
        payload.pendingAvatar = preset.avatar;
        payload.pendingProfileEffectId = preset.profileEffectId;
        payload.pendingAvatarDecoration = preset.avatarDecoration;
    }

    if (guildId) {
        payload.guildId = guildId;
    }

    FluxDispatcher.dispatch({
        type: "USER_PROFILE_SETTINGS_SET_PENDING_CHANGES",
        ...payload
    });

    if (typeof PendingProfileActions.setPendingNickname === "function") {
        PendingProfileActions.setPendingNickname(preset.nick ?? null);
    }
    if (typeof PendingProfileActions.setPendingPronouns === "function") {
        PendingProfileActions.setPendingPronouns(preset.pronouns ?? null);
    }

    if (isNitro) {
        if (typeof PendingProfileActions.setPendingBio === "function") {
            PendingProfileActions.setPendingBio(preset.bio ?? null);
        }
        if (typeof PendingProfileActions.setPendingThemeColors === "function") {
            PendingProfileActions.setPendingThemeColors(preset.themeColors);
        }
        if (typeof PendingProfileActions.setPendingBanner === "function") {
            PendingProfileActions.setPendingBanner(preset.banner);
        }
        if (typeof PendingProfileActions.setPendingAvatar === "function") {
            PendingProfileActions.setPendingAvatar(preset.avatar);
        }
        if (typeof PendingProfileActions.setPendingProfileEffectId === "function") {
            PendingProfileActions.setPendingProfileEffectId(preset.profileEffectId);
        }
        if (typeof PendingProfileActions.setPendingAvatarDecoration === "function") {
            PendingProfileActions.setPendingAvatarDecoration(preset.avatarDecoration);
        }
    }
}

export function resetProfileOverrides(isNitro: boolean, guildId?: string) {
    const payload: Record<string, unknown> = {
        pendingNickname: null,
        pendingPronouns: ""
    };

    if (isNitro) {
        payload.pendingBio = null;
        payload.pendingThemeColors = [];
        payload.pendingBanner = undefined;
        payload.pendingAvatar = undefined;
        payload.pendingProfileEffectId = undefined;
        payload.pendingAvatarDecoration = undefined;
    }

    if (guildId) {
        payload.guildId = guildId;
    }

    FluxDispatcher.dispatch({
        type: "USER_PROFILE_SETTINGS_SET_PENDING_CHANGES",
        ...payload
    });

    if (typeof PendingProfileActions.setPendingNickname === "function") {
        PendingProfileActions.setPendingNickname(null);
    }
    if (typeof PendingProfileActions.setPendingPronouns === "function") {
        PendingProfileActions.setPendingPronouns("");
    }

    if (isNitro) {
        if (typeof PendingProfileActions.setPendingBio === "function") {
            PendingProfileActions.setPendingBio(null);
        }
        if (typeof PendingProfileActions.setPendingThemeColors === "function") {
            PendingProfileActions.setPendingThemeColors([]);
        }
        if (typeof PendingProfileActions.setPendingBanner === "function") {
            PendingProfileActions.setPendingBanner(undefined);
        }
        if (typeof PendingProfileActions.setPendingAvatar === "function") {
            PendingProfileActions.setPendingAvatar(undefined);
        }
        if (typeof PendingProfileActions.setPendingProfileEffectId === "function") {
            PendingProfileActions.setPendingProfileEffectId(undefined);
        }
        if (typeof PendingProfileActions.setPendingAvatarDecoration === "function") {
            PendingProfileActions.setPendingAvatarDecoration(undefined);
        }
    }
}
