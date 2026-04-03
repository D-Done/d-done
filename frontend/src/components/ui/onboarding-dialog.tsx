"use client";

import * as React from "react";
import { motion } from "framer-motion";
import useEmblaCarousel from "embla-carousel-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FolderPlus,
  FileUp,
  Loader2,
  ClipboardCheck,
  FileText,
  User,
  Users,
} from "lucide-react";

// D-Done onboarding slides: create project → upload docs → DD check → tenant approval → view report
const SLIDES = [
  {
    id: "create-project",
    alt: "Create project",
    title: "צור פרויקט חדש",
    description:
      "התחל את תהליך בדיקת הנאותות על ידי יצירת פרויקט חדש. הזן את פרטי העסקה וסוג הפרויקט.",
    image:
      "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200&h=720&fit=crop",
    icon: FolderPlus,
  },
  {
    id: "upload-documents",
    alt: "Upload documents",
    title: "העלה מסמכים",
    description:
      "העלה את נסחי הטאבו, הסכמי תמ\"א ומסמכים משפטיים רלוונטיים. המערכת תתמוך ב-PDF.",
    image:
      "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=1200&h=720&fit=crop",
    icon: FileUp,
  },
  {
    id: "dd-check",
    alt: "Due diligence check",
    title: "הרצת בדיקת נאותות",
    description:
      "המערכת מנתחת את המסמכים באמצעות בינה מלאכותית ומפיקה חילוץ מובנה. ההרצה מתבצעת אוטומטית.",
    image:
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&h=720&fit=crop",
    icon: Loader2,
  },
  {
    id: "tenant-approval",
    alt: "Tenant table approval",
    title: "אישור טבלת דיירים",
    description:
      "בדוק ואישר את טבלת הדיירים שמוצגת לך. המערכת מחכה לאישורך לפני המשך הדוח.",
    image:
      "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1200&h=720&fit=crop",
    icon: ClipboardCheck,
  },
  {
    id: "view-report",
    alt: "View full DD report",
    title: "צפייה בדוח מלא",
    description:
      "הדוח המלא מוכן. צפה בניתוח, הורד כ-PDF או Word, ועבוד עם הציטוטים והמקורות.",
    image:
      "https://images.unsplash.com/photo-1596495578065-6e0763fa1178?w=1200&h=720&fit=crop",
    icon: FileText,
  },
] as const;

export type OnboardingSlideId = (typeof SLIDES)[number]["id"];

export interface OnboardingDialogProps {
  defaultOpen?: boolean;
  onComplete?: () => void;
  onSkip?: () => void;
  /** Optional profile completion (name, team) - shown as first slide when name or team is empty */
  profile?: {
    name: string;
    team: string;
    onProfileUpdate: (name: string, team: string) => Promise<void>;
  };
}

export function OnboardingDialog({
  defaultOpen = true,
  onComplete,
  onSkip,
  profile,
}: OnboardingDialogProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [activeIndex, setActiveIndex] = React.useState(0);

  const showProfileStep =
    profile && (!profile.name?.trim() || !profile.team?.trim());
  const totalSlides = showProfileStep ? SLIDES.length + 1 : SLIDES.length;
  const isProfileStep = showProfileStep && activeIndex === 0;

  const [profileName, setProfileName] = React.useState(profile?.name ?? "");
  const [profileTeam, setProfileTeam] = React.useState(profile?.team ?? "");
  const [profileSaving, setProfileSaving] = React.useState(false);

  React.useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setActiveIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  const isFirstSlide = activeIndex === 0;
  const isLastSlide = activeIndex === totalSlides - 1;

  const handleNext = async () => {
    if (isProfileStep && profile) {
      setProfileSaving(true);
      try {
        await profile.onProfileUpdate(profileName.trim(), profileTeam.trim());
        emblaApi?.scrollNext();
      } finally {
        setProfileSaving(false);
      }
      return;
    }
    if (isLastSlide) {
      setOpen(false);
      onComplete?.();
      return;
    }
    emblaApi?.scrollNext();
  };

  const handlePrevious = () => emblaApi?.scrollPrev();

  const handleSkip = () => {
    setOpen(false);
    onSkip?.();
  };

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => emblaApi?.scrollTo(0), 50);
        }}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Restart Onboarding
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Dialog */}
      <div
        className="relative mx-4 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-2xl animate-in fade-in-0 zoom-in-95"
        dir="rtl"
      >
        <div className="p-3 sm:p-4">
          {/* Carousel */}
          <div ref={emblaRef} className="overflow-hidden rounded-lg">
            <div className="flex">
              {showProfileStep && (
                <div className="min-w-0 flex-[0_0_100%]">
                  <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    <div className="relative aspect-video w-full overflow-hidden bg-muted">
                      <img
                        src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&h=720&fit=crop"
                        alt="Team collaboration"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-background/90 shadow-lg backdrop-blur-sm">
                          <User className="h-10 w-10 text-primary" />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-4 p-4">
                      <h2 className="text-lg font-semibold text-foreground">
                        השלם את פרטיך
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        הזן את שמך המלא ואת הצוות שלך כדי להמשיך.
                      </p>
                      <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="onboarding-name">שם מלא</Label>
                        <Input
                          id="onboarding-name"
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          placeholder="ישראל ישראלי"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="onboarding-team">
                          <Users className="mr-1.5 inline h-4 w-4" />
                          צוות
                        </Label>
                        <Input
                          id="onboarding-team"
                          value={profileTeam}
                          onChange={(e) => setProfileTeam(e.target.value)}
                          placeholder="מחלקת נדל״ן"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              )}
              {SLIDES.map((slide) => (
                <div key={slide.id} className="min-w-0 flex-[0_0_100%]">
                  <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    <div className="relative aspect-video w-full overflow-hidden">
                      <img
                        src={slide.image}
                        alt={slide.alt}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-br-xl bg-primary/90 text-primary-foreground shadow-md">
                        <slide.icon className="h-6 w-6" />
                      </div>
                    </div>
                    <div className="p-4">
                      <h2 className="text-lg font-semibold text-foreground">
                        {slide.title}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {slide.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dots */}
          <div className="mt-4 flex items-center justify-center gap-2">
            {Array.from({ length: totalSlides }).map((_, index) => (
              <motion.div
                key={index}
                animate={{
                  opacity: index === activeIndex ? 1 : 0.5,
                  width: index === activeIndex ? 24 : 16,
                }}
                initial={false}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <button
                  onClick={() => emblaApi?.scrollTo(index)}
                  aria-label={`Go to slide ${index + 1}`}
                  className={cn(
                    "h-2 w-full cursor-pointer rounded-full transition-colors",
                    index === activeIndex ? "bg-foreground" : "bg-border hover:bg-muted-foreground",
                  )}
                />
              </motion.div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-between px-1 pb-1">
            <div>
              {!isFirstSlide && (
                <button
                  onClick={handlePrevious}
                  className="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  חזור
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSkip}
                className="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                דלג
              </button>
              <button
                onClick={handleNext}
                disabled={profileSaving}
                className="cursor-pointer rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {profileSaving ? "שומר..." : isLastSlide ? "התחל" : "הבא"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
