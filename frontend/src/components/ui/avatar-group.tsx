"use client";

import Image from "next/image";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export interface AvatarItem {
  id: number | string;
  name: string;
  designation?: string | null;
  image?: string | null;
  userId?: string;
  email?: string;
}

interface AvatarGroupProps {
  items: AvatarItem[];
  className?: string;
  maxVisible?: number;
  size?: "sm" | "md" | "lg";
  onAvatarClick?: (userId: string) => void;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const Avatar = ({
  item,
  index,
  totalItems,
  size,
  isHovered,
  onHover,
  onLeave,
  onAvatarClick,
}: {
  item: AvatarItem;
  index: number;
  totalItems: number;
  size: "sm" | "md" | "lg";
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onAvatarClick?: (userId: string) => void;
}) => {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  };

  const showTooltip = item.name && (isHovered || !!item.designation);
  const clickable = !!(item.userId || item.email) && !!onAvatarClick;

  return (
    <div
      className="relative group flex items-center justify-center"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        marginLeft: index === 0 ? 0 : "-0.5rem",
        zIndex: totalItems - index,
      }}
      onClick={(e) => {
        if (onAvatarClick) {
          e.preventDefault();
          e.stopPropagation();
          const identifier = item.userId || item.email;
          if (identifier) onAvatarClick(identifier);
        }
      }}
    >
      <AnimatePresence mode="popLayout">
        {showTooltip && isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: {
                type: "spring",
                stiffness: 200,
                damping: 20,
              },
            }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute -top-16 whitespace-nowrap flex text-xs flex-col items-center justify-center rounded-xl bg-white dark:bg-slate-900 z-50 shadow-lg px-4 py-2 border min-w-max border-slate-200 dark:border-slate-700"
          >
            <div className="font-bold text-gray-900 dark:text-slate-100 relative z-30 text-base text-center">
              {item.name}
            </div>
            {item.designation && (
              <div className="text-gray-600 dark:text-slate-400 text-xs text-center">
                {item.designation}
              </div>
            )}
            {clickable && (
              <div className="text-sky-500 text-[10px] mt-0.5">לחץ לפרופיל</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        whileHover={{ scale: 1.05, zIndex: 100 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className={cn("relative", clickable && "cursor-pointer")}
      >
        {item.image ? (
          <Image
            height={100}
            width={100}
            src={item.image}
            alt={item.name}
            className={cn(
              "object-cover rounded-full border-2 border-background dark:border-slate-900 transition duration-300",
              size === "sm" ? "h-8 w-8" : size === "md" ? "h-10 w-10" : "h-12 w-12"
            )}
          />
        ) : (
          <div
            className={cn(
              "flex items-center justify-center rounded-full border-2 border-background dark:border-slate-900 bg-muted text-muted-foreground font-medium shrink-0",
              sizeClasses[size]
            )}
          >
            {getInitials(item.name)}
          </div>
        )}
      </motion.div>
    </div>
  );
};

const AvatarGroup = ({
  items,
  className,
  maxVisible = 5,
  size = "md",
  onAvatarClick,
}: AvatarGroupProps) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | string | null>(null);

  const visibleItems = items.slice(0, maxVisible);
  const remainingCount = items.length - maxVisible;

  return (
    <div className={cn("flex items-center justify-center", className)}>
      {visibleItems.map((item, index) => (
        <Avatar
          key={String(item.id)}
          item={item}
          index={index}
          totalItems={visibleItems.length}
          size={size}
          isHovered={hoveredIndex === item.id}
          onHover={() => setHoveredIndex(item.id)}
          onLeave={() => setHoveredIndex(null)}
          onAvatarClick={onAvatarClick}
        />
      ))}

      {remainingCount > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "flex items-center justify-center rounded-full border-2 border-background dark:border-slate-900 bg-muted text-muted-foreground font-medium text-xs shrink-0",
            size === "sm" ? "h-8 w-8" : size === "md" ? "h-10 w-10" : "h-12 w-12",
            "-ml-2"
          )}
        >
          +{remainingCount}
        </motion.div>
      )}
    </div>
  );
};

export default AvatarGroup;
