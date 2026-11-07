/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Devs, PawsomeDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { PresenceUpdate, User, VoiceState } from "@vencord/discord-types";
import { Menu, React, UserStore } from "@webpack/common";

import { NotificationsOffIcon } from "./components/NotificationsOffIcon";
import { NotificationsOnIcon } from "./components/NotificationsOnIcon";
import { UserManager } from "./components/UserManager";
import { addWatchedUser, isUserWatched, removeWatchedUser, settings } from "./settings";
import { handlePresenceUpdates, handleUserUpdate, handleVoiceStateUpdates, resetTrackerState } from "./tracker";

const UserContext: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user || user.id === UserStore.getCurrentUser()?.id) return;

    const watched = isUserWatched(user.id);
    const label = watched ? "Don't notify on changes" : "Notify on changes";
    const icon = watched ? NotificationsOffIcon : NotificationsOnIcon;

    const menuItem = (
        <Menu.MenuItem
            id="toggle-notify-user"
            label={label}
            action={() => {
                if (watched) {
                    removeWatchedUser(user.id);
                } else {
                    addWatchedUser(user.id);
                }
            }}
            icon={icon}
        />
    );

    const group = findGroupChildrenByChildId(["user-profile", "close-dm", "devmode-copy-id"], children);
    if (group) {
        group.push(menuItem);
    } else {
        children.push(<Menu.MenuGroup>{menuItem}</Menu.MenuGroup>);
    }
};

export default definePlugin({
    name: "NotifyUserChanges",
    description: "Notifies you when watched users update their status, custom status, activity, avatar, or voice channels.",
    authors: [Devs.D3SOX, PawsomeDevs.enzomtp],
    dependencies: ["ContextMenuAPI"],

    settings,
    settingsAboutComponent: UserManager,

    contextMenus: {
        "user-context": UserContext
    },

    stop() {
        resetTrackerState();
    },

    flux: {
        PRESENCE_UPDATES({ updates }: { updates: PresenceUpdate[]; }) {
            handlePresenceUpdates(updates);
        },

        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            handleVoiceStateUpdates(voiceStates);
        },

        USER_UPDATE({ user }: { user: User; }) {
            handleUserUpdate(user);
        }
    }
});
