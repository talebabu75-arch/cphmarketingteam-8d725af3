import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const PersonStat = z.object({
  name: z.string(),
  currentVisits: z.number(),
  previousVisits: z.number(),
  currentAttendance: z.number(), // %
  previousAttendance: z.number(),
  currentCoverage: z.number(), // unique locations
  performance: z.number(), // %
});

const Input = z.object({
  monthLabel: z.string(),
  previousMonthLabel: z.string(),
  teamTotals: z.object({
    totalVisits: z.number(),
    previousTotalVisits: z.number(),
    avgAttendance: z.number(),
    previousAvgAttendance: z.number(),
  }),
  persons: z.array(PersonStat).max(50),
});

export const generateSmartSuggestions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const system =
      "তুমি একজন মার্কেটিং পারফরম্যান্স অ্যানালিস্ট। ডেটা দেখে বাংলায় সংক্ষিপ্ত, কাজে লাগার মতো (actionable) ইনসাইট দাও। " +
      "প্রতিটি ইনসাইট ১টি বাক্যে — কে, কী পরিবর্তন, কত শতাংশ। উদাহরণ: \"Taiyab এই মাসে ১৮% কম visit করেছে\"। " +
      "শুধু গুরুত্বপূর্ণ পরিবর্তনগুলো বলো (অন্তত ১০% পরিবর্তন বা স্পষ্ট pattern)। সর্বোচ্চ ৭টি bullet। JSON বা markdown হেডার নয় — শুধু `- ` দিয়ে শুরু করা bullet list।";

    const prompt = `চলতি মাস: ${data.monthLabel}, পূর্ববর্তী মাস: ${data.previousMonthLabel}

টিম মোট:
- Visits: ${data.teamTotals.totalVisits} (আগের মাস: ${data.teamTotals.previousTotalVisits})
- Avg Attendance: ${data.teamTotals.avgAttendance}% (আগের মাস: ${data.teamTotals.previousAvgAttendance}%)

প্রতি স্টাফ:
${data.persons
  .map(
    (p) =>
      `- ${p.name}: visits ${p.currentVisits} (prev ${p.previousVisits}), attendance ${p.currentAttendance}% (prev ${p.previousAttendance}%), coverage ${p.currentCoverage} locations, performance ${p.performance}%`,
  )
  .join("\n")}

উপরের ডেটা থেকে সবচেয়ে গুরুত্বপূর্ণ smart suggestions দাও।`;

    const { text } = await generateText({
      model,
      system,
      prompt,
    });

    return { suggestions: text.trim() };
  });

/* ---------- Auto Report Summary ---------- */
const SummaryInput = z.object({
  monthLabel: z.string(),
  previousMonthLabel: z.string(),
  teamTotals: z.object({
    totalVisits: z.number(),
    previousTotalVisits: z.number(),
    avgAttendance: z.number(),
    previousAvgAttendance: z.number(),
    avgPerformance: z.number(),
    previousAvgPerformance: z.number(),
    locationsCovered: z.number(),
    previousLocationsCovered: z.number(),
  }),
  topPerformer: z.string().nullable(),
  weakestPerformer: z.string().nullable(),
});

export const generateAutoSummary = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SummaryInput.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const system =
      "তুমি একজন executive analyst। ২-৪ বাক্যে একটি executive summary লেখো বাংলায়। " +
      "প্রথম বাক্যে overall performance কত % বেড়েছে/কমেছে সেটা স্পষ্টভাবে বলো " +
      '(উদাহরণ: "This month overall performance improved by 12%")। ' +
      "তারপর সবচেয়ে গুরুত্বপূর্ণ ২টি observation (top performer, weak area, attendance trend ইত্যাদি)। " +
      "Markdown বা bullet নয় — শুধু paragraph। সংক্ষিপ্ত এবং পেশাদার।";

    const t = data.teamTotals;
    const pctChange = (cur: number, prev: number) =>
      prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

    const prompt = `Month: ${data.monthLabel} vs ${data.previousMonthLabel}

Team metrics:
- Total Visits: ${t.totalVisits} (prev ${t.previousTotalVisits}, change ${pctChange(t.totalVisits, t.previousTotalVisits)}%)
- Avg Attendance: ${t.avgAttendance}% (prev ${t.previousAvgAttendance}%, change ${t.avgAttendance - t.previousAvgAttendance} pp)
- Avg Performance: ${t.avgPerformance}% (prev ${t.previousAvgPerformance}%, change ${t.avgPerformance - t.previousAvgPerformance} pp)
- Locations Covered: ${t.locationsCovered} (prev ${t.previousLocationsCovered})
- Top performer: ${data.topPerformer ?? "N/A"}
- Weakest performer: ${data.weakestPerformer ?? "N/A"}

উপরের ডেটা থেকে executive summary লেখো।`;

    const { text } = await generateText({ model, system, prompt });
    return { summary: text.trim() };
  });

