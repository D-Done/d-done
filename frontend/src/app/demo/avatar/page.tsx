"use client";

import AvatarGroup from "@/components/ui/avatar-group";

/** Demo page for AvatarGroup with Unsplash images (no roles/designation). */
export default function AvatarDemoPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-12 p-8 bg-slate-50 dark:bg-slate-950">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          AvatarGroup (with images)
        </h1>
        <AvatarGroup
          items={[
            {
              id: 1,
              name: "John Doe",
              image:
                "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
            },
            {
              id: 2,
              name: "Jane Smith",
              image:
                "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop",
            },
            {
              id: 3,
              name: "Jim Beam",
              image:
                "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop",
            },
            {
              id: 4,
              name: "Alex Brown",
              image:
                "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
            },
            {
              id: 5,
              name: "Sam Wilson",
              image:
                "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
            },
            {
              id: 6,
              name: "Jordan Lee",
              image:
                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
            },
          ]}
          maxVisible={5}
          size="md"
        />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          With initials only (no images)
        </h2>
        <AvatarGroup
          items={[
            { id: "a", name: "אריאל כהן" },
            { id: "b", name: "מיכל לוי" },
            { id: "c", name: "דוד ישראלי" },
          ]}
          maxVisible={5}
          size="lg"
        />
      </div>
    </div>
  );
}
