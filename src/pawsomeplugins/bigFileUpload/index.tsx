/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { OpenExternalIcon } from "@components/Icons";
import { Devs, PawsomeDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { DraftType, Menu, PermissionsBits, PermissionStore, React, SelectedChannelStore, UploadManager } from "@webpack/common";

import { uploadFileToCatboxWithStreaming, uploadFileToLitterboxWithStreaming } from "./providers/catbox";
import { uploadFileCustomWithStreaming } from "./providers/custom";
import { uploadFileToGofileWithStreaming } from "./providers/gofile";
import { uploadFileToZiplineWithStreaming } from "./providers/zipline";
import { settings } from "./settings";
import { UploaderName } from "./types";
import { getErrorMessage, handleCSPError, logger, showToast } from "./utils";

const UploadStore = findByPropsLazy("getUploads");
const OptionClasses = findByPropsLazy("optionName", "optionIcon", "optionLabel");

function getCompatibleUploaders(fileSize: number, primaryUploader: UploaderName): UploaderName[] {
    const sizeMB = fileSize / (1024 * 1024);
    const uploaderOrder: UploaderName[] = [];

    if (!settings.store.enableFallback) {
        if (sizeMB > 1024 && (primaryUploader === "Catbox" || primaryUploader === "Litterbox")) {
            return [];
        }
        if (sizeMB > 200 && primaryUploader === "Catbox") {
            return [];
        }
        return [primaryUploader];
    }

    const fallbackMode = settings.store.fallbackOrder || "smart";

    if (fallbackMode !== "smart") {
        let baseList: UploaderName[] = [];
        switch (fallbackMode) {
            case "catbox-first":
                baseList = ["Catbox", "Litterbox", "GoFile", "Zipline", "Custom"];
                break;
            case "gofile-first":
                baseList = ["GoFile", "Catbox", "Litterbox", "Zipline", "Custom"];
                break;
            case "zipline-first":
                baseList = ["Zipline", "Catbox", "Litterbox", "GoFile", "Custom"];
                break;
            case "custom-first":
                baseList = ["Custom", "Catbox", "Litterbox", "GoFile", "Zipline"];
                break;
            default:
                baseList = ["Catbox", "Litterbox", "GoFile", "Zipline", "Custom"];
        }

        // Put primary first if compatible
        const order = [primaryUploader, ...baseList.filter(u => u !== primaryUploader)];

        // Filter out size-incompatible services
        return order.filter(u => {
            if (sizeMB > 1024 && (u === "Catbox" || u === "Litterbox")) return false;
            if (sizeMB > 200 && u === "Catbox") return false;
            return true;
        });
    }

    // Default smart size-based fallback
    if (sizeMB > 1024) {
        if (primaryUploader === "GoFile" || primaryUploader === "Zipline" || primaryUploader === "Custom") {
            uploaderOrder.push(primaryUploader);
        }
        const candidates: UploaderName[] = ["GoFile", "Zipline", "Custom"];
        for (const u of candidates) {
            if (!uploaderOrder.includes(u)) uploaderOrder.push(u);
        }
    } else if (sizeMB > 200) {
        if (primaryUploader !== "Catbox") {
            uploaderOrder.push(primaryUploader);
        }
        const candidates: UploaderName[] = ["Litterbox", "GoFile", "Zipline", "Custom"];
        for (const u of candidates) {
            if (!uploaderOrder.includes(u)) uploaderOrder.push(u);
        }
    } else {
        uploaderOrder.push(primaryUploader);
        const candidates: UploaderName[] = ["Catbox", "Litterbox", "GoFile", "Zipline", "Custom"];
        for (const u of candidates) {
            if (!uploaderOrder.includes(u)) uploaderOrder.push(u);
        }
    }

    return uploaderOrder;
}

async function uploadFile(file: File, channelId: string): Promise<void> {
    const primaryUploader = (settings.store.fileUploader as UploaderName) || "Catbox";
    const fileSizeMB = file.size / (1024 * 1024);

    logger.info(`Starting upload for file: ${file.name} (${fileSizeMB.toFixed(1)}MB)`);

    const uploaderOrder = getCompatibleUploaders(file.size, primaryUploader);
    logger.info(`Uploader order: ${uploaderOrder.join(", ")}`);

    if (uploaderOrder.length === 0) {
        showToast(`File is too large (${fileSizeMB.toFixed(1)}MB) for the selected uploader.`, "failure");
        sendBotMessage(channelId, {
            content: `**Upload cancelled**: File size is **${fileSizeMB.toFixed(1)}MB**, which exceeds the capacity of **${primaryUploader}**.`
        });
        return;
    }

    if (fileSizeMB > 300) {
        logger.warn(`Large file detected (${fileSizeMB.toFixed(1)}MB) - may take several minutes to upload.`);
        showToast(`Large file detected (${fileSizeMB.toFixed(1)}MB) - this may take several minutes`, "message");
    }

    let lastError: unknown = null;
    let attemptCount = 0;

    for (let i = 0; i < uploaderOrder.length; i++) {
        const uploader = uploaderOrder[i];
        attemptCount++;

        try {
            logger.info(`=== Attempt ${attemptCount}: ${uploader} ===`);

            if (i > 0) {
                const previousUploader = uploaderOrder[i - 1];
                logger.info(`${previousUploader} failed. Trying fallback uploader: ${uploader}`);
                showToast(`${previousUploader} failed. Trying ${uploader} as fallback...`, "message");

                await new Promise(resolve => setTimeout(resolve, 3000));

                try {
                    UploadManager.clearAll(channelId, DraftType.SlashCommand);
                } catch (clearError) {
                    logger.warn("Failed to clear upload manager state:", clearError);
                }
            }

            const timeoutSetting = settings.store.uploadTimeout || "standard";
            let uploadTimeout: number;

            switch (timeoutSetting) {
                case "conservative":
                    uploadTimeout = fileSizeMB > 100 ? 600000 : 300000;
                    break;
                case "extended":
                    uploadTimeout = fileSizeMB > 500 ? 1800000 : fileSizeMB > 300 ? 1200000 : fileSizeMB > 100 ? 900000 : 600000;
                    break;
                case "maximum":
                    uploadTimeout = fileSizeMB > 500 ? 3600000 : fileSizeMB > 300 ? 2400000 : fileSizeMB > 100 ? 1800000 : 1200000;
                    break;
                default:
                    uploadTimeout = fileSizeMB > 500 ? 1200000 : fileSizeMB > 300 ? 900000 : fileSizeMB > 100 ? 600000 : 300000;
            }

            if (fileSizeMB > 200) {
                showToast(`Uploading ${fileSizeMB.toFixed(1)}MB to ${uploader}...`, "message");
            }

            const uploadPromise = (() => {
                switch (uploader) {
                    case "GoFile":
                        return uploadFileToGofileWithStreaming(file, channelId);
                    case "Catbox":
                        return uploadFileToCatboxWithStreaming(file, channelId);
                    case "Litterbox":
                        return uploadFileToLitterboxWithStreaming(file, channelId);
                    case "Zipline":
                        return uploadFileToZiplineWithStreaming(file, channelId);
                    case "Custom":
                        return uploadFileCustomWithStreaming(file, channelId);
                    default:
                        throw new Error(`Unknown uploader: ${uploader}`);
                }
            })();

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Upload timeout after ${uploadTimeout / 60000} minutes`));
                }, uploadTimeout);
            });

            await Promise.race([uploadPromise, timeoutPromise]);
            logger.info(`${uploader} upload completed successfully`);
            return;
        } catch (error) {
            logger.error(`Upload failed with ${uploader}:`, error);
            lastError = error;

            const errorMsg = getErrorMessage(error);
            if (errorMsg.includes("timeout")) {
                showToast(`${uploader} timed out (${fileSizeMB.toFixed(1)}MB too large)`, "failure");
            }

            if (handleCSPError(error, uploader, channelId)) {
                continue;
            }

            if (i === uploaderOrder.length - 1) {
                logger.error("All uploaders failed. Last error:", lastError);

                sendBotMessage(channelId, {
                    content: "**All upload attempts failed!**\n" +
                        `File size: ${fileSizeMB.toFixed(1)}MB\n` +
                        `Attempts made: ${attemptCount}\n` +
                        `Tried: ${uploaderOrder.join(", ")}\n` +
                        `Last error: ${getErrorMessage(lastError)}`
                });
                showToast("All streaming uploads failed", "failure");
                UploadManager.clearAll(channelId, DraftType.SlashCommand);
                return;
            }
        }
    }
}

function triggerFileUpload() {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.style.display = "none";

    fileInput.onchange = async event => {
        const target = event.target as HTMLInputElement;
        if (target?.files && target.files.length > 0) {
            const file = target.files[0];
            if (file) {
                const channelId = SelectedChannelStore.getChannelId();
                await uploadFile(file, channelId);
            } else {
                showToast("No file selected");
            }
        }
    };

    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

const ctxMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (props.channel.guild_id && !PermissionStore.can(PermissionsBits.SEND_MESSAGES, props.channel)) return;

    children.splice(1, 0,
        <Menu.MenuItem
            id="upload-big-file"
            label={
                <div className={OptionClasses.optionLabel}>
                    <OpenExternalIcon className={OptionClasses.optionIcon} height={24} width={24} />
                    <div className={OptionClasses.optionName}>Upload a Big File</div>
                </div>
            }
            action={triggerFileUpload}
        />
    );
};

async function resolveFile(options: any[], ctx: any): Promise<File | null> {
    for (const opt of options) {
        if (opt.name === "file") {
            const upload = UploadStore.getUpload(ctx.channel.id, opt.name, DraftType.SlashCommand);
            return upload.item.file;
        }
    }
    return null;
}

export default definePlugin({
    name: "BigFileUpload",
    description: "Bypass Discord's upload limit by uploading files using the 'Upload a Big File' button or /fileupload and they'll get uploaded as links into chat via file uploaders.",
    authors: [Devs.ScattrdBlade, PawsomeDevs.enzomtp],
    settings,
    dependencies: ["CommandsAPI"],
    contextMenus: {
        "channel-attach": ctxMenuPatch,
    },
    commands: [
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "fileupload",
            description: "Upload a file",
            options: [
                {
                    name: "file",
                    description: "The file to upload",
                    type: ApplicationCommandOptionType.ATTACHMENT,
                    required: true,
                },
            ],
            execute: async (opts, cmdCtx) => {
                const file = await resolveFile(opts, cmdCtx);
                if (file) {
                    await uploadFile(file, cmdCtx.channel.id);
                } else {
                    sendBotMessage(cmdCtx.channel.id, { content: "No file specified!" });
                    UploadManager.clearAll(cmdCtx.channel.id, DraftType.SlashCommand);
                }
            },
        },
    ],
});
