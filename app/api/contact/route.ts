import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PUT(request: NextRequest) {
    try {
        const { id, ai_enabled } = await request.json()

        if (!id || typeof ai_enabled !== "boolean") {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
        }

        const { data, error } = await supabase
            .from("contacts")
            .update({ ai_enabled })
            .eq("id", id)
            .select()
            .single()

        if (error) {
            console.error("Error updating contact:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, data })
    } catch (error) {
        console.error("Error in PUT /api/contact:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
