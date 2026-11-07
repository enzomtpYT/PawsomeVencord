/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { copyWithToast, openUserProfile } from "@utils/discord";
import type { User } from "@vencord/discord-types";
import { Avatar, Clickable, PresenceStore, showToast, TextInput, useMemo, UserStore,useState } from "@webpack/common";

import { addWatchedUser, getWatchedUserIds, removeWatchedUser, settings } from "../settings";

function UserEntry({ userId }: { userId: string; }) {
    const user = UserStore.getUser(userId) as (User & { globalName?: string; }) | undefined;
    const status = PresenceStore.getStatus(userId) ?? "offline";

    const displayName = user?.globalName || user?.username || "Unknown User";
    const username = user?.username ? `@${user.username}` : userId;

    const statusColors: Record<string, string> = {
        online: "var(--status-positive)",
        idle: "var(--status-warning)",
        dnd: "var(--status-danger)",
        offline: "var(--text-muted)"
    };

    return (
        <Card
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: "8px",
                background: "var(--background-secondary)"
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                <Clickable onClick={() => openUserProfile(userId)}>
                    <Avatar
                        src={user?.getAvatarURL(undefined, 80, true)}
                        size="SIZE_40"
                        aria-label={displayName}
                    />
                </Clickable>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Clickable
                            onClick={() => openUserProfile(userId)}
                            style={{ fontWeight: 600, fontSize: "14px", color: "var(--header-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                            {displayName}
                        </Clickable>
                        <span
                            style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor: statusColors[status] || statusColors.offline,
                                display: "inline-block"
                            }}
                            title={`Status: ${status}`}
                        />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
                        <span>{username}</span>
                        <span>•</span>
                        <Clickable
                            onClick={() => copyWithToast(userId, "Copied User ID to clipboard")}
                            style={{ fontFamily: "monospace", textDecoration: "underline" }}
                            title="Click to copy ID"
                        >
                            {userId}
                        </Clickable>
                    </div>
                </div>
            </div>

            <Button
                size="small"
                variant="dangerPrimary"
                onClick={() => {
                    removeWatchedUser(userId);
                    showToast({ text: `Removed ${displayName} from watched list`, variant: "success" });
                }}
            >
                Remove
            </Button>
        </Card>
    );
}

export function UserManager() {
    const { userIds } = settings.use(["userIds"]);
    const [inputVal, setInputVal] = useState("");

    const watchedList = useMemo(() => getWatchedUserIds(), [userIds]);

    const handleAdd = () => {
        const trimmed = inputVal.trim();
        if (!/^\d{17,20}$/.test(trimmed)) {
            showToast({ text: "Please enter a valid Discord User Snowflake ID (17-20 digits)", variant: "critical" });
            return;
        }

        if (addWatchedUser(trimmed)) {
            const addedUser = UserStore.getUser(trimmed);
            const name = addedUser?.username ?? trimmed;
            showToast({ text: `Now watching changes for ${name}`, variant: "success" });
            setInputVal("");
        } else {
            showToast({ text: "User is already in your watched list" });
        }
    };

    return (
        <section style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "12px", marginBottom: "16px" }}>
            <div>
                <Heading tag="h3">Watched Users ({watchedList.length})</Heading>
                <Paragraph>
                    Manage users you are actively watching. You can also right-click any user in chat or member lists to toggle notifications.
                </Paragraph>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                    <TextInput
                        placeholder="Add user by Discord ID (e.g. 123456789012345678)..."
                        value={inputVal}
                        onChange={setInputVal}
                        onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === "Enter") handleAdd();
                        }}
                    />
                </div>
                <Button
                    onClick={handleAdd}
                    disabled={!/^\d{17,20}$/.test(inputVal.trim())}
                >
                    Add User
                </Button>
            </div>

            {watchedList.length === 0 ? (
                <Card style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)" }}>
                    <Paragraph>No users are being watched yet. Right-click a user or enter their ID above to start watching.</Paragraph>
                </Card>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {watchedList.map(id => (
                        <UserEntry key={id} userId={id} />
                    ))}
                </div>
            )}
        </section>
    );
}
