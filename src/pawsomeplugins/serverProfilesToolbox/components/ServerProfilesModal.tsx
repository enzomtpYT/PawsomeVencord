/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Card } from "@components/Card";
import { Paragraph } from "@components/Paragraph";
import type { RenderModalProps } from "@vencord/discord-types";
import {
    GuildStore,
    Modal,
    openModal,
    React,
    SearchableSelect,
    SelectedGuildStore,
    useMemo,
    useState,
    useStateFromStores
} from "@webpack/common";

import { ToolboxPanel } from "./ToolboxPanel";

export function ServerProfilesModal({ modalProps, initialGuildId }: { modalProps: RenderModalProps; initialGuildId?: string; }) {
    const lastSelectedGuildId = useStateFromStores(
        [SelectedGuildStore],
        () => SelectedGuildStore.getLastSelectedGuildId() ?? SelectedGuildStore.getGuildId()
    );

    const guildOptions = useMemo(() => {
        return GuildStore.getGuildsArray()
            .map(g => ({ label: g.name, value: g.id }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, []);

    const [selectedGuildId, setSelectedGuildId] = useState<string | undefined>(
        initialGuildId ?? lastSelectedGuildId ?? guildOptions[0]?.value
    );

    return (
        <Modal {...modalProps} size="lg" title="Server Profiles Toolbox">
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "8px 0" }}>
                <Card style={{ padding: "12px", background: "var(--background-secondary)" }}>
                    <Paragraph style={{ margin: "0 0 8px 0", color: "var(--header-secondary)", fontWeight: 600 }}>
                        Target Server
                    </Paragraph>
                    <SearchableSelect
                        options={guildOptions}
                        value={guildOptions.find(o => o.value === selectedGuildId)?.value}
                        placeholder="Select a server..."
                        onChange={(val: string) => setSelectedGuildId(val)}
                        clearable={false}
                        closeOnSelect
                    />
                </Card>

                {selectedGuildId ? (
                    <ToolboxPanel guildId={selectedGuildId} />
                ) : (
                    <Paragraph style={{ color: "var(--text-muted)" }}>
                        No servers found. Please join a server to manage server profiles.
                    </Paragraph>
                )}
            </div>
        </Modal>
    );
}

export function openServerProfilesModal(initialGuildId?: string) {
    openModal(props => <ServerProfilesModal modalProps={props} initialGuildId={initialGuildId} />);
}
