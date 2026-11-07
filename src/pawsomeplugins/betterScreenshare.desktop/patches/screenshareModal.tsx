/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { Flex } from "@components/Flex";
import { React } from "@webpack/common";

import { SettingsModalCard, SettingsModalCardItem } from "../../philsPluginLibrary";
import Plugin from "..";
import { AudioSourceSelect, OpenScreenshareSettingsButton } from "../components";
import { PluginInfo } from "../constants";
import { screenshareStore } from "../stores";

const ReplacedStreamSettings = () => {
    const { use } = screenshareStore;

    const { audioSourceEnabled, setAudioSourceEnabled } = use();

    const cardProps = { style: { border: "1px solid var(--border-subtle, var(--background-secondary))" } };

    return (
        <div style={{ margin: "1em", display: "flex", flexDirection: "column", gap: "1em" }}>
            <SettingsModalCard cardProps={cardProps} title="Stream Settings">
                <SettingsModalCardItem>
                    <Flex flexDirection="column">
                        <OpenScreenshareSettingsButton title="Advanced Settings" />
                    </Flex>
                </SettingsModalCardItem>
            </SettingsModalCard>
            <SettingsModalCard
                cardProps={cardProps}
                switchEnabled
                switchProps={{
                    checked: audioSourceEnabled ?? false,
                    onChange: (status: boolean) => setAudioSourceEnabled(status)
                }}
                title="Audio Source"
            >
                <SettingsModalCardItem>
                    <AudioSourceSelect isDisabled={!audioSourceEnabled} />
                </SettingsModalCardItem>
            </SettingsModalCard>
        </div>
    );
};

export function replacedSubmitFunction(fn: (...args: any[]) => any) {
    return (...args: any[]) => {
        const { screensharePatcher, screenshareAudioPatcher } = Plugin as any;

        if (screensharePatcher) {
            screensharePatcher.forceUpdateTransportationOptions();
            if (screensharePatcher.connection?.connectionState === "CONNECTED") {
                screensharePatcher.forceUpdateDesktopSourceOptions();
            }
        }

        if (screenshareAudioPatcher) {
            screenshareAudioPatcher.forceUpdateTransportationOptions();
        }
        return fn(...args);
    };
}

export function GoLivePanelWrapper({ children }: { children?: React.ReactNode; [key: string]: any; }) {
    const { hideDefaultSettings } = (Settings.plugins as any)[PluginInfo.PLUGIN_NAME] ?? {};
    if (hideDefaultSettings) {
        return <ReplacedStreamSettings />;
    }

    if (React.isValidElement(children) && Array.isArray((children.props as any)?.children)) {
        try {
            (children.props as any).children.push(<ReplacedStreamSettings key="vc-bs-stream-settings" />);
            return children;
        } catch {
            // If immutable/frozen, fallback to JSX fragment
        }
    }

    return (
        <>
            {children}
            <ReplacedStreamSettings key="vc-bs-stream-settings" />
        </>
    );
}
