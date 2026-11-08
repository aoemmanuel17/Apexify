import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { resolveEntitlement } from "@/lib/entitlements.server";

const BASE_PROMPT = `You are the Apexify AI Tutor, an expert Nigerian curriculum tutor for BECE, WAEC, NECO, JAMB and SAT students. You cover Mathematics, English, Sciences, Business, Arts, Languages and Learning Skills.

Response guidelines:
- Be warm, patient and encouraging — like a favourite teacher.
- Use clear markdown: short paragraphs, **bold** for key terms, bullet lists, numbered steps, fenced code blocks for code.
- Structure substantial answers with these markdown H3 sections, in this order, skipping any that do not apply:
  "### Explanation", "### Key Points", "### Worked Example", "### Practice Questions", "### Common Mistakes", "### Exam Tips", "### Related Lessons", "### Continue Learning".
- Keep greetings and one-line questions short — do not force sections onto small talk.
- Use LaTeX-style math with \\( … \\) inline and \\[ … \\] display when it helps; plain notation otherwise.
- Reference the Nigerian syllabus and local examples where helpful.
- For homework or uploaded questions, teach the method step-by-step — never just dump the final answer.
- Never fabricate facts. If unsure, say so and suggest how to verify.`;

const MODE_PROMPTS: Record<string, string> = {
  Beginner: "Teaching mode: BEGINNER. Assume no prior knowledge. Use everyday analogies, define every term, keep sentences short.",
  Intermediate: "Teaching mode: INTERMEDIATE. Assume the student knows the basics. Move at a normal classroom pace.",
  Advanced: "Teaching mode: ADVANCED. Go deep, include derivations, edge cases and higher-order reasoning.",
  "Exam Preparation": "Teaching mode: EXAM PREP. Frame everything around how the topic is actually examined. Include past-question style items, marking-scheme language and time-saving tricks.",
  Revision: "Teaching mode: REVISION. The student already learned this. Give tight recaps, memory hooks, formulas and rapid-fire self-test questions.",
  "Quick Summary": "Teaching mode: QUICK SUMMARY. Be brief — a short explanation plus key points only. No worked examples unless asked.",
  "Deep Explanation": "Teaching mode: DEEP EXPLANATION. Take your time, build intuition from first principles, then formalise.",
};

type ChatBody = { messages?: unknown; mode?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Verify the signed-in student before spending any AI credits.
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Please sign in to use the AI Tutor.", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !auth.user) return new Response("Please sign in to use the AI Tutor.", { status: 401 });
        const userId = auth.user.id;

        const { messages, mode } = (await request.json()) as ChatBody;
        if (!Array.isArray(messages) || messages.length > 200) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response("AI Tutor is not configured yet.", { status: 500 });
        }

        const [{ data: settings }, planEntitlement, { data: activeGoal }] = await Promise.all([
          supabaseAdmin.from("ai_settings").select("*").limit(1).maybeSingle(),
          resolveEntitlement(supabaseAdmin, userId),
          supabaseAdmin.from("learner_goals").select("kind, exam_code, target_year, institution, programme, skill_category, skill").eq("user_id", userId).eq("is_active", true).maybeSingle(),
        ]);
        const configuredLimit = planEntitlement.tier === "free"
          ? settings?.daily_message_limit_free ?? 20
          : settings?.daily_message_limit_premium ?? 200;
        const limit = configuredLimit > 0
          ? Math.min(planEntitlement.limits.ai_daily_messages, configuredLimit)
          : planEntitlement.limits.ai_daily_messages;

        const since = new Date();
        since.setUTCHours(0, 0, 0, 0);
        const { count } = await supabaseAdmin
          .from("ai_usage_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("feature", "tutor")
          .gte("created_at", since.toISOString());
        if (limit > 0 && (count ?? 0) >= limit) {
          return new Response(
            planEntitlement.tier !== "free"
              ? "You've reached today's AI Tutor limit. It resets at midnight."
              : "You've used today's free AI Tutor messages. Upgrade for more, or come back tomorrow.",
            { status: 429 },
          );
        }
        const modelId = settings?.model || "openai/gpt-5.6-sol";
        const started = Date.now();
        const extra = [settings?.system_instructions, settings?.tutor_instructions].filter(Boolean).join("\n\n");

        const modeLine = typeof mode === "string" && MODE_PROMPTS[mode] ? `\n\n${MODE_PROMPTS[mode]}` : "";
        const pathDetails = activeGoal?.kind === "exam"
          ? [activeGoal.exam_code, activeGoal.target_year].filter(Boolean).join(" ")
          : activeGoal?.kind === "university"
            ? [activeGoal.institution, activeGoal.programme].filter(Boolean).join(" — ")
            : activeGoal?.kind === "skill"
              ? [activeGoal.skill_category, activeGoal.skill].filter(Boolean).join(" — ")
              : "";
        const boardLine = pathDetails
          ? `\n\nThe student's active learning path is ${pathDetails} (${activeGoal?.kind}). Adapt examples, explanations and advice to that path.`
          : "";

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway(modelId),
          system: `${BASE_PROMPT}${extra ? `\n\n${extra}` : ""}${modeLine}${boardLine}`,
          maxOutputTokens: settings?.max_response_tokens || undefined,
          onFinish: async ({ usage }) => {
            await supabaseAdmin.from("ai_usage_logs").insert({
              user_id: userId,
              feature: "tutor",
              model: modelId,
              prompt_tokens: usage?.inputTokens ?? 0,
              completion_tokens: usage?.outputTokens ?? 0,
              latency_ms: Date.now() - started,
              status: "success",
            });
          },
          messages: await convertToModelMessages(messages as UIMessage[]),
          providerOptions: { lovable: { reasoningEffort: "none" } },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
          onError: (error) => {
            const message = error instanceof Error ? error.message : "AI request failed";
            if (/402/.test(message)) return "AI credits exhausted. Please add credits in workspace billing.";
            if (/429/.test(message)) return "Rate limited. Please try again in a moment.";
            return message;
          },
        });
      },
    },
  },
});