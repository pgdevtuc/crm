import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
export async function POST(request: Request) {


    try {
        const formData = await request.formData()
        const file = formData.get("file") as File
        const contactId = formData.get("contactId") as string
        const type = formData.get("type") as string

        if (!file || !contactId || !type) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
        }

        // Generate unique filename
        const fileExt = file.name.split(".").pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
        const filePath = `${contactId}/${fileName}`

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage.from("chat-media").upload(filePath, file, {
            contentType: file.type,
            upsert: false,
        })

        if (uploadError) {
            console.error("Upload error:", uploadError)
            return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
        }

        // Get public URL
        const {
            data: { publicUrl },
        } = supabase.storage.from("chat-media").getPublicUrl(filePath)

        return NextResponse.json({
            url: publicUrl,
            fileName: file.name,
            type,
        })
    } catch (error) {
        console.error("Error uploading file:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
