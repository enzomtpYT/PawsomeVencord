/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs, EquicordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import { UserStore } from "@webpack/common";

export default definePlugin({
    name: "AlwaysPing",
    description: "You will always get pinged when replied to.",
    authors: [Devs.z1xus, EquicordDevs.enzomtp],

    flux: {
        MESSAGE_CREATE({ message }: { message?: any; }) {
            const currentUserId = UserStore.getCurrentUser()?.id;
            if (!currentUserId || !message?.referenced_message) return;

            if (
                message.author?.id !== currentUserId &&
                message.referenced_message.author?.id === currentUserId &&
                !message.mentions?.some((mention: { id: string; }) => mention.id === currentUserId)
            ) {
                message.mentions = Array.isArray(message.mentions) ? [...message.mentions, { id: currentUserId }] : [{ id: currentUserId }];
                message.mentioned = true;
            }
        }
    }
});
