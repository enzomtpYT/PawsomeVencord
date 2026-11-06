/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DraftType, UploadManager } from "@webpack/common";

import { settings } from "../settings";
import { formatUrlForChat, getErrorMessage, logger, Native, sendTextToChat, showToast } from "../utils";

export async function uploadFileToGofileWithStreaming(file: File, channelId: string): Promise<void> {
    const servers = [
        "store1", "store2", "store3", "store4", "store5", "store6", "store7", "store8", "store9", "store10",
        "store-eu-par-1", "store-eu-par-2", "store-eu-par-3", "store-eu-par-4",
        "store-na-phx-1"
    ];
    const server = servers[Math.floor(Math.random() * servers.length)];

    try {
        const startTime = Date.now();
        logger.info(`[GoFile] Starting upload of ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);

        const arrayBuffer = await file.arrayBuffer();
        const uploadResult = await Native.uploadFileToGofileNative(
            `https://${server}.gofile.io/uploadFile`,
            arrayBuffer,
            file.name,
            file.type,
            settings.store.gofileToken
        );

        const uploadTime = Date.now() - startTime;
        logger.info(`[GoFile] Upload completed in ${uploadTime}ms`);

        if ((uploadResult as any).status === "ok") {
            const { downloadPage } = (uploadResult as any).data;
            const finalUrl = formatUrlForChat(file.name, downloadPage);

            setTimeout(() => sendTextToChat(`${finalUrl} `), 10);
            showToast(`${file.name} Successfully Uploaded to GoFile!`, "success");
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else {
            throw new Error(`GoFile upload failed: ${JSON.stringify(uploadResult)}`);
        }
    } catch (nativeError) {
        const errorMsg = getErrorMessage(nativeError);
        const sizeMB = file.size / (1024 * 1024);

        if (errorMsg.includes("413") || errorMsg.includes("payload too large")) {
            throw new Error(`GoFile rejected file: too large (${sizeMB.toFixed(1)}MB)`);
        } else if (errorMsg.includes("timeout") || errorMsg.includes("network")) {
            throw new Error(`GoFile upload timeout (${sizeMB.toFixed(1)}MB file may be too large)`);
        }

        throw new Error(`GoFile streaming upload failed: ${errorMsg}`);
    }
}
