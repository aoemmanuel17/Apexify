import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/academiq/Navbar";
import { Hero } from "@/components/academiq/Hero";
import { WhyAcademiq } from "@/components/academiq/WhyAcademiq";
import { ExamPrep } from "@/components/academiq/ExamPrep";
import { AITutorPreview } from "@/components/academiq/AITutorPreview";
import { LearningCategories } from "@/components/academiq/LearningCategories";
import { ComingSoon } from "@/components/academiq/ComingSoon";
import { CTASection } from "@/components/academiq/CTASection";
import { Footer } from "@/components/academiq/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Academiq — Learn Smarter. Achieve More." },
      {
        name: "description",
        content:
          "Academiq is an AI-powered learning platform helping Nigerian students master concepts, prepare for WAEC, NECO, and JAMB, and unlock their potential.",
      },
      { property: "og:title", content: "Academiq — Learn Smarter. Achieve More." },
      {
        property: "og:description",
        content:
          "AI tutoring, exam preparation, and personalized learning for Nigerian secondary school students. A Thrixion product.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Academiq — Learn Smarter. Achieve More." },
      {
        name: "twitter:description",
        content: "AI-powered learning for Nigerian students. A Thrixion product.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <WhyAcademiq />
      <ExamPrep />
      <AITutorPreview />
      <LearningCategories />
      <ComingSoon />
      <CTASection />
      <Footer />
    </main>
  );
}