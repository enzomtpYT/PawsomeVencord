/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId } from "@api/ContextMenu";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Devs, PawsomeDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { Guild, User } from "@vencord/discord-types";
import { Menu, NewCustomizationSection, UserStore } from "@webpack/common";

import { openServerProfilesModal } from "./components/ServerProfilesModal";

export default definePlugin({
    name: "ServerProfilesToolbox",
    authors: [Devs.D3SOX, PawsomeDevs.enzomtp],
    description: "Manage, copy, paste, and switch server profile presets (nicknames, pronouns, bios, banners, avatars) with presets and JSON import/export.",

    toolboxActions: {
        "Server Profiles Toolbox": () => openServerProfilesModal()
    },

    settingsAboutComponent: () => (
        <Card style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
            <Heading tag="h3">Server Profiles Toolbox</Heading>
            <Paragraph>
                Easily manage, copy, paste, and switch server profile presets (nicknames, pronouns, bios, banners, avatars, and profile effects) across any server.
            </Paragraph>
            <div style={{ display: "flex", gap: "8px" }}>
                <Button
                    variant="primary"
                    size="small"
                    onClick={() => openServerProfilesModal()}
                >
                    Open Server Profiles Toolbox
                </Button>
            </div>
        </Card>
    ),

    contextMenus: {
        "guild-context"(children, { guild }: { guild: Guild; }) {
            if (!guild?.id) return;
            const group = findGroupChildrenByChildId("privacy", children) ?? children;
            group.push(
                <Menu.MenuItem
                    id="vc-server-profiles-toolbox"
                    label="Server Profiles Toolbox"
                    action={() => openServerProfilesModal(guild.id)}
                />
            );
        },
        "guild-header-popout"(children, { guild }: { guild: Guild; }) {
            if (!guild?.id) return;
            const group = findGroupChildrenByChildId("privacy", children) ?? children;
            group.push(
                <Menu.MenuItem
                    id="vc-server-profiles-toolbox"
                    label="Server Profiles Toolbox"
                    action={() => openServerProfilesModal(guild.id)}
                />
            );
        },
        "user-context"(children, { user, guildId }: { user: User; guildId?: string; }) {
            if (user?.id === UserStore.getCurrentUser().id && guildId) {
                const group = findGroupChildrenByChildId("user-profile", children) ?? children;
                group.push(
                    <Menu.MenuItem
                        id="vc-server-profiles-toolbox"
                        label="Server Profiles Toolbox"
                        action={() => openServerProfilesModal(guildId)}
                    />
                );
            }
        }
    },

    patches: [
        {
            find: "UserProfileModalV2EditingPanel",
            replacement: [
                {
                    match: /disabled:(\i\|\|\i),avatarErrorMessage:\i,avatarDecorationErrorMessage:\i\}\),/,
                    replace: "$&$self.renderSidebarSection({disabled:$1}),"
                }
            ]
        }
    ],

    renderSidebarSection: ErrorBoundary.wrap(({ disabled }: { disabled?: boolean; }) => {
        if (!NewCustomizationSection) return null;

        return (
            <NewCustomizationSection heading="Server Profiles Toolbox" disabled={disabled}>
                <div style={{ display: "flex", gap: "8px", padding: "4px 0" }}>
                    <Button
                        size="small"
                        variant="primary"
                        onClick={() => openServerProfilesModal()}
                    >
                        Open Toolbox
                    </Button>
                </div>
            </NewCustomizationSection>
        );
    }, { noop: true })
});
