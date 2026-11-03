/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { PluginCard } from "@components/settings/tabs/plugins/PluginCard";
import { Margins } from "@utils/margins";
import { relaunch } from "@utils/native";
import { IpcRes } from "@utils/types";
import { showToast, TextInput, useState } from "@webpack/common";

import Plugins, { PluginMeta } from "~plugins";

const userPlugins = Object.values(Plugins).filter(p => PluginMeta[p.name].userPlugin);

function errorText(res: IpcRes) {
    return res.ok ? "" : typeof res.error === "string" ? res.error : String(res.error?.message ?? res.error);
}

function UserPluginsTab() {
    const [name, setName] = useState("");
    const [building, setBuilding] = useState(false);

    async function create() {
        const res = await VencordNative.userPlugins.create(name);
        if (!res.ok) return showToast({ text: errorText(res), variant: "critical" });

        setName("");
        showToast({ text: `${name} was created. Rebuild to load it.`, variant: "success" });
    }

    async function build() {
        setBuilding(true);
        const res = await VencordNative.userPlugins.build();
        setBuilding(false);
        if (!res.ok) return showToast({ text: errorText(res), variant: "critical" });

        relaunch();
    }

    return (
        <SettingsTab>
            <Paragraph className={Margins.bottom16}>
                Make your own mods! Every folder inside <code>src/userplugins</code> is loaded as a plugin.
                Create one below, edit its <code>index.tsx</code>, then rebuild and restart to see your changes.
            </Paragraph>

            <Flex className={Margins.bottom20} gap="0.5em">
                <Button variant="secondary" onClick={() => VencordNative.userPlugins.openFolder()}>
                    Open Plugins Folder
                </Button>
                <Button disabled={building} onClick={build}>
                    {building ? "Building..." : "Rebuild and Restart"}
                </Button>
            </Flex>

            <Divider className={Margins.bottom20} />

            <Heading className={Margins.bottom8}>Create a New Plugin</Heading>
            <Flex className={Margins.bottom20} gap="0.5em">
                <div className="vc-userplugins-input">
                    <TextInput placeholder="MyCoolPlugin" value={name} onChange={setName} />
                </div>
                <Button disabled={!name} onClick={create}>Create</Button>
            </Flex>

            <Divider className={Margins.bottom20} />

            <Heading className={Margins.bottom8}>Your Plugins</Heading>
            {userPlugins.length
                ? (
                    <div className="vc-plugins-grid">
                        {userPlugins.map(p => (
                            <PluginCard key={p.name} plugin={p} disabled={false} onRestartNeeded={() => showToast({ text: "Restart to apply this change." })} />
                        ))}
                    </div>
                )
                : <Paragraph>You don't have any plugins yet. Create one above, then rebuild.</Paragraph>
            }
        </SettingsTab>
    );
}

export default wrapTab(UserPluginsTab, "My Plugins");
