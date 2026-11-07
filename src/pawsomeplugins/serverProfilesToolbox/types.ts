/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface ServerProfilePreset {
    id: string;
    name: string;
    timestamp: number;
    nick: string | null;
    pronouns: string | null;
    bio: string | null;
    themeColors?: number[];
    banner?: string;
    avatar?: string;
    profileEffectId?: string;
    avatarDecoration?: string;
}
