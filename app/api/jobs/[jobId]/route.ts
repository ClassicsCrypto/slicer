import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const { jobId } = params
  const supabase = createServerClient()

  const { error } = await supabase.from('jobs').delete().eq('id', jobId)

  if (error) {
    console.error('Delete job error:', error)
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
