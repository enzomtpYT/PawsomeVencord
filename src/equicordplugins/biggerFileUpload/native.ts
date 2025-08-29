/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export async function uploadFileToGofileNative(_, fileBuffer: ArrayBuffer, fileName: string, fileType: string, token?: string): Promise<any> {
    try {
        const serverResponse = await fetch("https://api.gofile.io/servers");
        const serverData = await serverResponse.json();
        const serverList = serverData.data.servers;
        const server = serverList[Math.floor(Math.random() * serverList.length)].name;

        const formData = new FormData();
        const file = new Blob([fileBuffer], { type: fileType });
        formData.append("file", new File([file], fileName));

        if (token) {
            formData.append("token", token);
        }

        const uploadUrl = `https://${server}.gofile.io/uploadFile`;

        if (fileBuffer.byteLength > 50 * 1024 * 1024) {
            console.log(`Large file detected (${(fileBuffer.byteLength / (1024 * 1024)).toFixed(2)}MB), using optimized fetch`);

            const uploadResponse = await fetch(uploadUrl, {
                method: "POST",
                body: formData,
                keepalive: true,
                signal: AbortSignal.timeout(10 * 60 * 1000)
            });

            const result = await uploadResponse.json();
            return result;
        } else {
            const uploadResponse = await fetch(uploadUrl, {
                method: "POST",
                body: formData,
            });

            const result = await uploadResponse.json();
            return result;
        }
    } catch (error) {
        console.error("Error during GoFile upload:", error);
        throw error;
    }
}


export async function uploadFileToCatboxNative(_, url: string, fileBuffer: ArrayBuffer, fileName: string, fileType: string, extraField: { userhash?: string; time?: string; }): Promise<string> {
    try {
        const formData = new FormData();
        formData.append("reqtype", "fileupload");

        const file = new Blob([fileBuffer], { type: fileType });
        formData.append("fileToUpload", new File([file], fileName));

        // Optional fields
        if (extraField.userhash) {
            formData.append("userhash", extraField.userhash);
        }
        if (extraField.time) {
            formData.append("time", extraField.time);
        }

        if (fileBuffer.byteLength > 50 * 1024 * 1024) {
            console.log(`Large file detected (${(fileBuffer.byteLength / (1024 * 1024)).toFixed(2)}MB), using optimized fetch`);

            const options: RequestInit = {
                method: "POST",
                body: formData,
                keepalive: true,
                signal: AbortSignal.timeout(10 * 60 * 1000)
            };

            const response = await fetch(url, options);
            const result = await response.text();
            return result;
        } else {
            const options: RequestInit = {
                method: "POST",
                body: formData,
            };

            const response = await fetch(url, options);
            const result = await response.text();
            return result;
        }
    } catch (error) {
        console.error("Error during fetch request:", error);
        throw error;
    }
}


export async function uploadFileCustomNative(_, url: string, fileBuffer: ArrayBuffer, fileName: string, fileType: string, fileFormName: string, customArgs: Record<string, string>, customHeaders: Record<string, string>, responseType: string, urlPath: string[]): Promise<string> {
    try {
        const formData = new FormData();
        const fileSizeMB = fileBuffer.byteLength / (1024 * 1024);

        const file = new Blob([fileBuffer], { type: fileType });
        formData.append(fileFormName, new File([file], fileName));

        for (const [key, value] of Object.entries(customArgs)) {
            formData.append(key, value);
        }

        delete customHeaders["Content-Type"];
        const headers = new Headers(customHeaders);

        let fetchOptions: RequestInit;

        if (fileBuffer.byteLength > 50 * 1024 * 1024) {
            console.log(`Large file detected (${fileSizeMB.toFixed(2)}MB), using optimized fetch`);

            fetchOptions = {
                method: "POST",
                body: formData,
                headers: headers,
                keepalive: true,
                signal: AbortSignal.timeout(10 * 60 * 1000)
            };
        } else {
            fetchOptions = {
                method: "POST",
                body: formData,
                headers: headers
            };
        }

        const uploadResponse = await fetch(url, fetchOptions);

        if (!uploadResponse.ok) {
            throw new Error(`HTTP error! status: ${uploadResponse.status}, statusText: ${uploadResponse.statusText}`);
        }

        let uploadResult;
        if (responseType === "JSON") {
            uploadResult = await uploadResponse.json();
        } else {
            uploadResult = await uploadResponse.text();
        }

        let finalUrl = "";
        if (responseType === "JSON") {
            let current = uploadResult;
            for (const key of urlPath) {
                if (current[key] === undefined) {
                    throw new Error(`Invalid URL path: ${urlPath.join(".")}`);
                }
                current = current[key];
            }
            finalUrl = current;
        } else {
            finalUrl = uploadResult.trim();
        }

        return finalUrl;
    } catch (error) {
        console.error("Error during fetch request:", error);
        throw error;
    }
}
