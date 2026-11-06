/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./settings.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { SettingsSection } from "@components/settings/tabs/plugins/components/Common";
import { Margins } from "@utils/margins";
import { OptionType } from "@utils/types";
import { React, Select, TextInput, useEffect, useState } from "@webpack/common";

import { UploaderName } from "./types";
import { showToast } from "./utils";

function createCloneableStore(initialState: any) {
    const store = { ...initialState };
    const listeners: (() => void)[] = [];

    function get() {
        return { ...store };
    }

    function set(newState: Partial<typeof store>) {
        Object.assign(store, newState);
        listeners.forEach(listener => listener());
    }

    function subscribe(listener: () => void) {
        listeners.push(listener);
        return () => {
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        };
    }

    return {
        get,
        set,
        subscribe
    };
}

export const FALLBACK_ORDER_OPTIONS: { label: string; value: string; }[] = [
    { label: "Default Smart Size-Based (Recommended)", value: "smart" },
    { label: "Catbox -> Litterbox -> GoFile -> Zipline -> Custom", value: "catbox-first" },
    { label: "GoFile -> Catbox -> Litterbox -> Zipline -> Custom", value: "gofile-first" },
    { label: "Zipline -> Catbox -> Litterbox -> GoFile -> Custom", value: "zipline-first" },
    { label: "Custom -> Catbox -> Litterbox -> GoFile -> Zipline", value: "custom-first" },
];

function SettingsComponent() {
    const initialUploader = (settings.store.fileUploader as UploaderName) || "Catbox";
    const [fileUploader, setFileUploader] = useState<string>(initialUploader);
    const [customUploaderStore] = useState(() => createCloneableStore({
        name: settings.store.customUploaderName || "",
        requestURL: settings.store.customUploaderRequestURL || "",
        fileFormName: settings.store.customUploaderFileFormName || "",
        responseType: settings.store.customUploaderResponseType || "",
        url: settings.store.customUploaderURL || "",
        thumbnailURL: settings.store.customUploaderThumbnailURL || "",
        headers: (() => {
            try {
                const parsedHeaders = JSON.parse(settings.store.customUploaderHeaders || "{}");
                if (Object.keys(parsedHeaders).length === 0) parsedHeaders[""] = "";
                return parsedHeaders;
            } catch {
                return { "": "" };
            }
        })(),
        args: (() => {
            try {
                const parsedArgs = JSON.parse(settings.store.customUploaderArgs || "{}");
                if (Object.keys(parsedArgs).length === 0) parsedArgs[""] = "";
                return parsedArgs;
            } catch {
                return { "": "" };
            }
        })(),
    }));

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!settings.store.fileUploader || settings.store.fileUploader.trim() === "") {
            updateSetting("fileUploader", "Catbox");
        }

        const unsubscribe = customUploaderStore.subscribe(() => {
            const state = customUploaderStore.get();
            updateSetting("customUploaderName", state.name);
            updateSetting("customUploaderRequestURL", state.requestURL);
            updateSetting("customUploaderFileFormName", state.fileFormName);
            updateSetting("customUploaderResponseType", state.responseType);
            updateSetting("customUploaderURL", state.url);
            updateSetting("customUploaderThumbnailURL", state.thumbnailURL);
            updateSetting("customUploaderHeaders", JSON.stringify(state.headers));
            updateSetting("customUploaderArgs", JSON.stringify(state.args));
        });

        return unsubscribe;
    }, []);

    function updateSetting(key: keyof typeof settings.store, value: any) {
        if (key in settings.store) {
            (settings.store as any)[key] = value;
        }
    }

    function handleShareXConfigUpload(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e: ProgressEvent<FileReader>) => {
                try {
                    const config = JSON.parse(e.target?.result as string);

                    customUploaderStore.set({
                        name: "",
                        requestURL: "",
                        fileFormName: "",
                        responseType: "Text",
                        url: "",
                        thumbnailURL: "",
                        headers: { "": "" },
                        args: { "": "" }
                    });

                    customUploaderStore.set({
                        name: config.Name || "",
                        requestURL: config.RequestURL || "",
                        fileFormName: config.FileFormName || "",
                        responseType: config.ResponseType || "Text",
                        url: config.URL || "",
                        thumbnailURL: config.ThumbnailURL || "",
                        headers: config.Headers || { "": "" },
                        args: config.Arguments || { "": "" }
                    });

                    updateSetting("customUploaderName", config.Name || "");
                    updateSetting("customUploaderRequestURL", config.RequestURL || "");
                    updateSetting("customUploaderFileFormName", config.FileFormName || "");
                    updateSetting("customUploaderResponseType", config.ResponseType || "Text");
                    updateSetting("customUploaderURL", config.URL || "");
                    updateSetting("customUploaderThumbnailURL", config.ThumbnailURL || "");
                    updateSetting("customUploaderHeaders", JSON.stringify(config.Headers || { "": "" }));
                    updateSetting("customUploaderArgs", JSON.stringify(config.Arguments || { "": "" }));

                    setFileUploader("Custom");
                    updateSetting("fileUploader", "Custom");

                    showToast("ShareX config imported successfully!", "success");
                } catch {
                    showToast("Error importing ShareX config. Check console for details.", "failure");
                }
            };
            reader.readAsText(file);
            event.target.value = "";
        }
    }

    const validateCustomUploaderSettings = () => {
        if (fileUploader === "Custom") {
            if (!settings.store.customUploaderRequestURL || settings.store.customUploaderRequestURL.trim() === "") {
                showToast("Custom uploader request URL is required.", "failure");
                return false;
            }
            if (!settings.store.customUploaderFileFormName || settings.store.customUploaderFileFormName.trim() === "") {
                showToast("Custom uploader file form name is required.", "failure");
                return false;
            }
            if (!settings.store.customUploaderURL || settings.store.customUploaderURL.trim() === "") {
                showToast("Custom uploader URL (JSON path) is required.", "failure");
                return false;
            }
            if (settings.store.customUploaderURL.includes("$json:") || settings.store.customUploaderURL.includes("$")) {
                showToast("Please replace placeholder values in custom uploader URL field.", "failure");
                return false;
            }
        }
        return true;
    };

    const handleFileUploaderChange = (v: string) => {
        if (!v || v.trim() === "") return;
        if (v === "Custom" && !validateCustomUploaderSettings()) return;
        setFileUploader(v);
        updateSetting("fileUploader", v);
    };

    const handleArgChange = (oldKey: string, newKey: string, value: any) => {
        const state = customUploaderStore.get();
        const newArgs = { ...state.args };

        if (oldKey !== newKey) {
            delete newArgs[oldKey];
        }

        if (value === "" && newKey === "") {
            delete newArgs[oldKey];
        } else {
            newArgs[newKey] = value;
        }

        if (Object.values(newArgs).every(v => v !== "") && Object.keys(newArgs).every(k => k !== "")) {
            newArgs[""] = "";
        }

        customUploaderStore.set({ args: newArgs });
    };

    const handleHeaderChange = (oldKey: string, newKey: string, value: string) => {
        const state = customUploaderStore.get();
        const newHeaders = { ...state.headers };

        if (oldKey !== newKey) {
            delete newHeaders[oldKey];
        }

        if (value === "" && newKey === "") {
            delete newHeaders[oldKey];
        } else {
            newHeaders[newKey] = value;
        }

        if (Object.values(newHeaders).every(v => v !== "") && Object.keys(newHeaders).every(k => k !== "")) {
            newHeaders[""] = "";
        }

        customUploaderStore.set({ headers: newHeaders });
    };

    const triggerShareXImport = () => {
        fileInputRef.current?.click();
    };

    return (
        <Flex flexDirection="column" gap="1em">
            <Divider />
            <SettingsSection
                id="file-uploader"
                name="Upload Limit Bypass"
                description="Select the external file uploader service to be used to bypass Discord's upload limit."
            >
                <Select
                    options={[
                        { label: "GoFile (Temporary | Unlimited)", value: "GoFile" },
                        { label: "Catbox (Up to 200MB)", value: "Catbox" },
                        { label: "Litterbox (Temporary | Up to 1GB)", value: "Litterbox" },
                        { label: "Zipline (Self-Hosted | Ask for Access to enzomtp)", value: "Zipline" },
                        { label: "Custom Uploader", value: "Custom" },
                    ]}
                    select={handleFileUploaderChange}
                    isSelected={v => v === fileUploader}
                    serialize={v => v}
                    closeOnSelect={true}
                    clearable={false}
                />
            </SettingsSection>

            <FormSwitch
                title="Enable Automatic Fallback"
                description="If the chosen uploader fails or the file exceeds its limits, automatically try other compatible services."
                value={settings.store.enableFallback}
                onChange={(enabled: boolean) => updateSetting("enableFallback", enabled)}
                hideBorder={true}
            />

            {settings.store.enableFallback && (
                <SettingsSection
                    id="fallback-priority-order"
                    name="Fallback Priority Order"
                    description="Choose the ordering strategy to use when attempting fallback uploads."
                >
                    <Select
                        options={FALLBACK_ORDER_OPTIONS}
                        select={(val: string) => updateSetting("fallbackOrder", val)}
                        isSelected={(val: string) => val === (settings.store.fallbackOrder || "smart")}
                        serialize={v => v}
                        closeOnSelect={true}
                        clearable={false}
                    />
                </SettingsSection>
            )}

            <FormSwitch
                title="Auto-Send Uploads To Chat"
                description="Whether to automatically send the links with the uploaded files to chat instead of just pasting them into the chatbox."
                value={settings.store.autoSend === "Yes"}
                onChange={(enabled: boolean) => updateSetting("autoSend", enabled ? "Yes" : "No")}
                hideBorder={true}
            />

            <FormSwitch
                title="Auto-Mask Links"
                description="Whether to mask the link to match the original filename."
                value={settings.store.autoFormat === "Yes"}
                onChange={(enabled: boolean) => updateSetting("autoFormat", enabled ? "Yes" : "No")}
                hideBorder={true}
            />

            <SettingsSection
                id="upload-timeout"
                name="Upload Timeout"
                description="Configure how long to wait for large file uploads before timing out. Higher settings allow larger files but may hang longer if the upload fails."
            >
                <Select
                    options={[
                        { label: "Conservative (10 min max)", value: "conservative" },
                        { label: "Standard (20 min max)", value: "standard" },
                        { label: "Extended (30 min max)", value: "extended" },
                        { label: "Maximum (60 min max)", value: "maximum" },
                    ]}
                    select={(newValue: string) => updateSetting("uploadTimeout", newValue)}
                    isSelected={(v: string) => v === (settings.store.uploadTimeout || "standard")}
                    serialize={(v: string) => v}
                    closeOnSelect={true}
                    clearable={false}
                />
            </SettingsSection>

            {fileUploader === "GoFile" && (
                <SettingsSection
                    id="gofile-token"
                    name="GoFile Token (optional)"
                    description="Insert your personal GoFile account token to save all uploads to your account."
                >
                    <TextInput
                        value={settings.store.gofileToken || ""}
                        placeholder="Insert GoFile Token"
                        onChange={newValue => updateSetting("gofileToken", newValue)}
                    />
                </SettingsSection>
            )}

            {fileUploader === "Catbox" && (
                <SettingsSection
                    id="catbox-user-hash"
                    name="Catbox User Hash (optional)"
                    description="Insert your personal Catbox account hash to save all uploads to your account."
                >
                    <TextInput
                        value={settings.store.catboxUserHash || ""}
                        placeholder="Insert User Hash"
                        onChange={newValue => updateSetting("catboxUserHash", newValue)}
                    />
                </SettingsSection>
            )}

            {fileUploader === "Litterbox" && (
                <SettingsSection
                    id="litterbox-expiry"
                    name="File Expiration Time"
                    description="Select how long it should take for your uploads to expire and get deleted."
                >
                    <Select
                        options={[
                            { label: "1 hour", value: "1h" },
                            { label: "12 hours", value: "12h" },
                            { label: "24 hours", value: "24h" },
                            { label: "72 hours", value: "72h" },
                        ]}
                        placeholder="Select Expiration Time"
                        select={(newValue: string) => updateSetting("litterboxTime", newValue)}
                        isSelected={(v: string) => v === (settings.store.litterboxTime || "1h")}
                        serialize={(v: string) => v}
                        closeOnSelect={true}
                        clearable={false}
                    />
                </SettingsSection>
            )}

            {fileUploader === "Zipline" && (
                <>
                    <SettingsSection
                        id="zipline-server-url"
                        name="Server URL"
                        description="The upload endpoint URL of your Zipline instance."
                    >
                        <TextInput
                            value={settings.store.ziplineServerURL || "https://share.enzomtp.party/api/upload"}
                            placeholder="https://share.enzomtp.party/api/upload"
                            onChange={newValue => updateSetting("ziplineServerURL", newValue)}
                        />
                    </SettingsSection>
                    <SettingsSection
                        id="zipline-auth-token"
                        name="Authorization Token (required)"
                        description="Your Zipline user token."
                    >
                        <TextInput
                            type="password"
                            value={settings.store.ziplineAuthToken || ""}
                            placeholder="Zipline User Token"
                            onChange={newValue => updateSetting("ziplineAuthToken", newValue)}
                        />
                    </SettingsSection>
                    <SettingsSection
                        id="zipline-folder"
                        name="Folder (optional)"
                        description="Folder Name or ID"
                    >
                        <TextInput
                            value={settings.store.ziplineFolder || ""}
                            placeholder="Folder Name or ID"
                            onChange={newValue => updateSetting("ziplineFolder", newValue)}
                        />
                    </SettingsSection>
                    <SettingsSection
                        id="zipline-delete-after"
                        name="Delete After (optional)"
                        description="Duration before the uploaded file is deleted (e.g. 1d, 7d, 1y)."
                    >
                        <TextInput
                            value={settings.store.ziplineDeleteAfter || ""}
                            placeholder="e.g. 30d, 12h, 7d"
                            onChange={newValue => updateSetting("ziplineDeleteAfter", newValue)}
                        />
                    </SettingsSection>
                </>
            )}

            {fileUploader === "Custom" && (
                <>
                    <SettingsSection
                        id="custom-uploader-name"
                        name="Uploader Name"
                        description="Label for this custom uploader configuration."
                    >
                        <TextInput
                            value={customUploaderStore.get().name}
                            placeholder="Custom Uploader"
                            onChange={(newValue: string) => customUploaderStore.set({ name: newValue })}
                        />
                    </SettingsSection>

                    <SettingsSection
                        id="custom-uploader-request-url"
                        name="Request URL"
                        description="HTTP endpoint to POST file uploads to."
                    >
                        <TextInput
                            value={customUploaderStore.get().requestURL}
                            placeholder="https://example.com/upload"
                            onChange={(newValue: string) => customUploaderStore.set({ requestURL: newValue })}
                        />
                    </SettingsSection>

                    <SettingsSection
                        id="custom-uploader-form-name"
                        name="File Form Name"
                        description="Multipart form field name for the uploaded file (usually 'file')."
                    >
                        <TextInput
                            value={customUploaderStore.get().fileFormName}
                            placeholder="file"
                            onChange={(newValue: string) => customUploaderStore.set({ fileFormName: newValue })}
                        />
                    </SettingsSection>

                    <SettingsSection
                        id="custom-uploader-response-type"
                        name="Response Type"
                        description="Format returned by the server upon upload completion."
                    >
                        <Select
                            options={[
                                { label: "Text", value: "Text" },
                                { label: "JSON", value: "JSON" },
                            ]}
                            placeholder="Select Response Type"
                            select={(newValue: string) => customUploaderStore.set({ responseType: newValue })}
                            isSelected={(v: string) => v === customUploaderStore.get().responseType}
                            serialize={(v: string) => v}
                        />
                    </SettingsSection>

                    <SettingsSection
                        id="custom-uploader-url-path"
                        name="URL (JSON path)"
                        description="Enter the JSON path to extract the file URL from the response (e.g. 'url', 'data.file_url')."
                    >
                        <TextInput
                            value={customUploaderStore.get().url}
                            placeholder="url"
                            onChange={(newValue: string) => customUploaderStore.set({ url: newValue })}
                        />
                    </SettingsSection>

                    <SettingsSection
                        id="custom-uploader-thumbnail-path"
                        name="Thumbnail URL (JSON path)"
                        description="Enter the JSON path to extract the thumbnail URL if available."
                    >
                        <TextInput
                            value={customUploaderStore.get().thumbnailURL}
                            placeholder="Thumbnail URL"
                            onChange={(newValue: string) => customUploaderStore.set({ thumbnailURL: newValue })}
                        />
                    </SettingsSection>

                    <Divider />
                    <Heading tag="h4">Custom Uploader Arguments</Heading>
                    {Object.entries(customUploaderStore.get().args).map(([key, value], index) => (
                        <div key={index} className="vc-bfu-input-grid">
                            <TextInput
                                value={key}
                                placeholder="Argument Key"
                                onChange={(newKey: string) => handleArgChange(key, newKey, value as string)}
                            />
                            <TextInput
                                value={value as string}
                                placeholder="Argument Value"
                                onChange={(newValue: string) => handleArgChange(key, key, newValue)}
                            />
                        </div>
                    ))}

                    <Divider />
                    <Heading tag="h4">Headers</Heading>
                    {Object.entries(customUploaderStore.get().headers).map(([key, value], index) => (
                        <div key={index} className="vc-bfu-input-grid">
                            <TextInput
                                value={key}
                                placeholder="Header Key"
                                onChange={(newKey: string) => handleHeaderChange(key, newKey, value as string)}
                            />
                            <TextInput
                                value={value as string}
                                placeholder="Header Value"
                                onChange={(newValue: string) => handleHeaderChange(key, key, newValue)}
                            />
                        </div>
                    ))}

                    <Divider />
                    <SettingsSection
                        id="sharex-import"
                        name="Import ShareX Config"
                        description="Import settings directly from a ShareX .sxcu file."
                    >
                        <Button
                            onClick={triggerShareXImport}
                            variant="primary"
                            className={Margins.bottom16}
                        >
                            Import .sxcu
                        </Button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".sxcu"
                            style={{ display: "none" }}
                            onChange={handleShareXConfigUpload}
                        />
                    </SettingsSection>
                </>
            )}
        </Flex>
    );
}

export const settings = definePluginSettings({
    fileUploader: {
        type: OptionType.SELECT,
        options: [
            { label: "GoFile (Streaming)", value: "GoFile" },
            { label: "Catbox (Up to 200MB)", value: "Catbox", default: true },
            { label: "Litterbox (Temporary | Up to 1GB)", value: "Litterbox" },
            { label: "Zipline", value: "Zipline" },
            { label: "Custom Uploader", value: "Custom" },
        ],
        description: "Select the file uploader service",
        hidden: true
    },
    enableFallback: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Automatically try fallback services if an upload fails",
        hidden: true
    },
    fallbackOrder: {
        type: OptionType.SELECT,
        options: FALLBACK_ORDER_OPTIONS.map(opt => ({ label: opt.label, value: opt.value, default: opt.value === "smart" })),
        description: "Order priority when attempting fallbacks",
        hidden: true
    },
    gofileToken: {
        type: OptionType.STRING,
        default: "",
        description: "GoFile Token (optional)",
        hidden: true
    },
    autoSend: {
        type: OptionType.SELECT,
        options: [
            { label: "Yes", value: "Yes" },
            { label: "No", value: "No", default: true },
        ],
        description: "Auto-Send",
        hidden: true
    },
    autoFormat: {
        type: OptionType.SELECT,
        options: [
            { label: "Yes", value: "Yes" },
            { label: "No", value: "No", default: true },
        ],
        description: "Auto-Format",
        hidden: true
    },
    uploadTimeout: {
        type: OptionType.SELECT,
        options: [
            { label: "Conservative (10 min max)", value: "conservative" },
            { label: "Standard (20 min max)", value: "standard", default: true },
            { label: "Extended (30 min max)", value: "extended" },
            { label: "Maximum (60 min max)", value: "maximum" },
        ],
        description: "Upload timeout for large files",
        hidden: true
    },
    catboxUserHash: {
        type: OptionType.STRING,
        default: "",
        description: "User hash for Catbox uploader (optional)",
        hidden: true
    },
    litterboxTime: {
        type: OptionType.SELECT,
        options: [
            { label: "1 hour", value: "1h", default: true },
            { label: "12 hours", value: "12h" },
            { label: "24 hours", value: "24h" },
            { label: "72 hours", value: "72h" },
        ],
        description: "Duration for files on Litterbox before they are deleted",
        hidden: true
    },
    ziplineAuthToken: {
        type: OptionType.STRING,
        default: "",
        description: "Authorization token for Zipline uploader (required)",
        hidden: true
    },
    ziplineServerURL: {
        type: OptionType.STRING,
        default: "https://share.enzomtp.party/api/upload",
        description: "Server URL for Zipline uploader",
        hidden: true
    },
    ziplineFolder: {
        type: OptionType.STRING,
        default: "",
        description: "Folder for Zipline uploader (optional)",
        hidden: true
    },
    ziplineDeleteAfter: {
        type: OptionType.STRING,
        default: "",
        description: "Delete after duration for Zipline uploader (optional, e.g., 30d, 12h, 7d)",
        hidden: true
    },
    customUploaderName: {
        type: OptionType.STRING,
        default: "",
        description: "Name of the custom uploader",
        hidden: true
    },
    customUploaderRequestURL: {
        type: OptionType.STRING,
        default: "",
        description: "Request URL for the custom uploader",
        hidden: true
    },
    customUploaderFileFormName: {
        type: OptionType.STRING,
        default: "",
        description: "File form name for the custom uploader",
        hidden: true
    },
    customUploaderResponseType: {
        type: OptionType.SELECT,
        options: [
            { label: "Text", value: "Text", default: true },
            { label: "JSON", value: "JSON" },
        ],
        description: "Response type for the custom uploader",
        hidden: true
    },
    customUploaderURL: {
        type: OptionType.STRING,
        default: "",
        description: "URL (JSON path) for the custom uploader",
        hidden: true
    },
    customUploaderThumbnailURL: {
        type: OptionType.STRING,
        default: "",
        description: "Thumbnail URL (JSON path) for the custom uploader",
        hidden: true
    },
    customUploaderHeaders: {
        type: OptionType.STRING,
        default: JSON.stringify({}),
        description: "Headers for the custom uploader (JSON string)",
        hidden: true
    },
    customUploaderArgs: {
        type: OptionType.STRING,
        default: JSON.stringify({}),
        description: "Arguments for the custom uploader (JSON string)",
        hidden: true
    },
    customSettings: {
        type: OptionType.COMPONENT,
        component: SettingsComponent,
        description: "Configure custom uploader settings",
        hidden: false
    },
}).withPrivateSettings<{
    customUploaderArgs?: Record<string, string>;
    customUploaderHeaders?: Record<string, string>;
}>();
