/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MediaEngineStore as WebpackMediaEngineStore } from "@webpack/common";

import * as types from "../types";

export const MediaEngineStore = WebpackMediaEngineStore as unknown as types.MediaEngineStore;
