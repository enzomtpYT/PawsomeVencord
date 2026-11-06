/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginNative } from "@utils/types";

export type UploaderName = "Catbox" | "Litterbox" | "GoFile" | "Zipline" | "Custom";

export type BigFileUploadNative = PluginNative<typeof import("./native")>;

export interface CustomUploaderConfig {
    name?: string;
    requestURL?: string;
    fileFormName?: string;
    responseType?: "JSON" | "Text";
    url?: string;
    thumbnailURL?: string;
    headers?: Record<string, string>;
    args?: Record<string, string>;
}
