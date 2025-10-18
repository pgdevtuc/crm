import assistantService from "@/services/assistant.service";

export async function POST(req: Request) {
    const { prompt } = await req.json();
    const responseAssistant = await assistantService.sendMessage("123", prompt);
    return new Response(JSON.stringify(responseAssistant));
}