/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Button, ButtonProps } from "@components/Button";
import { Flex } from "@components/Flex";
import { Tooltip } from "@webpack/common";
import React, { JSX } from "react";

export interface IconTooltipButtonProps extends ButtonProps {
    tooltipText?: string;
    icon?: JSX.Element;
}

export const IconTooltipButton = ({ tooltipText, icon, size = "small", style, ...props }: IconTooltipButtonProps) => {
    return (
        <Tooltip text={tooltipText}>
            {tooltipProps => <Button
                size={size}
                {...props}
                style={{ aspectRatio: 1, maxHeight: "32px", boxSizing: "border-box", ...style }}
            >
                <Flex style={{ justifyContent: "center", alignItems: "center", width: 24, height: 24 }}>
                    {icon}
                </Flex>
                <span {...tooltipProps} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
            </Button>}
        </Tooltip >
    );
};
