"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PartyPopper, CheckCircle2 } from "lucide-react";

export function ApprovalCelebration({
  onComplete,
  userName,
}: {
  onComplete?: () => void;
  userName?: string | null;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 3500);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          dir="rtl"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="mx-4 rounded-2xl border border-emerald-200 bg-white p-8 shadow-2xl dark:border-emerald-800 dark:bg-slate-900"
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <motion.div
                animate={{
                  scale: [1, 1.15, 1],
                  rotate: [0, 5, -5, 0],
                }}
                transition={{
                  duration: 0.6,
                  repeat: 2,
                  repeatDelay: 0.2,
                }}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400"
              >
                <PartyPopper className="h-10 w-10" />
              </motion.div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  אושרת בהצלחה!
                </h2>
              </div>
              <p className="text-slate-600 dark:text-slate-400">
                {userName
                  ? `ברוך הבא, ${userName}! חשבונך אושר.`
                  : "חשבונך אושר. אתה מוכן להתחיל."}
              </p>
              <p className="text-4xl" aria-hidden>
                🎉
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
