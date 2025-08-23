import { useEffect, useRef, useState } from 'react'
import './App.css'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import confetti from 'canvas-confetti'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  prompt: z.string().min(1, 'Prompt is required'),
  allowEmail: z.boolean().refine((v) => v === true, {
    message: 'You must allow email to participate',
  }),
})

type FormValues = z.infer<typeof formSchema>

function App() {
  const [submitted, setSubmitted] = useState<null | FormValues>(null)
  const [copied, setCopied] = useState(false)
  const [promptTimerStarted, setPromptTimerStarted] = useState(false)
  const [promptSecondsLeft, setPromptSecondsLeft] = useState(60)
  const [promptLocked, setPromptLocked] = useState(false)
  const promptTimerRef = useRef<number | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      prompt: '',
      allowEmail: true,
    },
    mode: 'onBlur',
  })

  const promptValue = form.watch('prompt')

  useEffect(() => {
    if (!promptTimerStarted && !promptLocked) {
      const length = (promptValue || '').trim().length
      if (length > 10) {
        setPromptTimerStarted(true)
        setPromptSecondsLeft(60)
        if (promptTimerRef.current) {
          clearInterval(promptTimerRef.current)
        }
        promptTimerRef.current = window.setInterval(() => {
          setPromptSecondsLeft((prev) => {
            if (prev <= 1) {
              if (promptTimerRef.current) clearInterval(promptTimerRef.current)
              promptTimerRef.current = null
              setPromptLocked(true)
              return 0
            }
            return prev - 1
          })
        }, 1000)
      }
    }
  }, [promptValue, promptTimerStarted, promptLocked])

  useEffect(() => {
    return () => {
      if (promptTimerRef.current) clearInterval(promptTimerRef.current)
    }
  }, [])

  const onSubmit = async (values: FormValues) => {
    try {
      await fetch('http://localhost:8787/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      // Best-effort; we still show local success UX regardless
    } catch (_) {
      // ignore network errors for local-only flow
    }
    setSubmitted(values)
    confetti({ particleCount: 180, spread: 70, origin: { y: 0.6 } })
  }

  useEffect(() => {
    if (copied) {
      const id = setTimeout(() => setCopied(false), 1200)
      return () => clearTimeout(id)
    }
  }, [copied])

  return (
    <div className="dark min-h-screen flex flex-col bg-gray-900 text-white font-['Inter']">
      <header className="z-50 bg-white/5 backdrop-blur-xl border-b border-white/10 shadow-lg">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center">
            <img src="/logo.svg" alt="logo" className="h-12 w-auto transition-transform hover:scale-105" />
            <h1 className="text-2xl font-bold pl-2">TJHSST Dev Club</h1>
          </div>
          <nav className="hidden md:flex items-center space-x-8">
            <a
              href="https://ion.tjhsst.edu/eighth/activity/12"
              target="_blank"
              rel="noopener noreferrer"
              className="relative text-white hover:text-white transition-colors duration-200 font-bold group flex items-center gap-1"
            >
              Sign up
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span className="absolute bottom-0 left-0 w-0 h-px bg-white/60 group-hover:w-full transition-all duration-200 ease-out"></span>
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-10">
          <h2 className="text-3xl font-bold mb-2">Activity Fair Competition Signup</h2>
          <p className="text-white/70 mb-6">Fill out the form below to participate.</p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 rounded-xl bg-white/5 border border-white/10 p-6 backdrop-blur-sm shadow-lg">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="Personal email or <ionusername>@tjhsst.edu" type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>AI Prompt for the Competition</FormLabel>
                    <span className="text-xs font-medium text-red-400">
                      {promptTimerStarted || promptLocked
                        ? `${Math.floor(promptSecondsLeft / 60)}:${String(promptSecondsLeft % 60).padStart(2, '0')}`
                        : '1:00'}
                    </span>
                  </div>
                  <FormDescription className="text-white/70">You have 1 minute to write your prompt.</FormDescription>
                  <FormControl>
                    <Textarea placeholder="Enter your prompt here" rows={5} disabled={promptLocked} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="allowEmail"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 rounded-md border border-white/10 p-3">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(Boolean(v))} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="text-white">Allow us to email you about the competition (required)</FormLabel>
                    <FormDescription className="text-white/70">
                      You must opt-in so we can contact you for rounds and results.
                    </FormDescription>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            <div className="flex items-center gap-3">
              <Button type="submit" className="">Submit</Button>
              {submitted ? (
                <span className="text-green-300">Thank you! 🎉 Submission received.</span>
              ) : null}
            </div>
          </form>
        </Form>

        {submitted ? (
          <div className="mt-6">
            <div className="text-sm mb-2 text-white/70">Copy your submitted prompt for bolt.diy</div>
            <div className="rounded-md border border-white/10 bg-white/5">
              <div className="p-3 text-sm whitespace-pre-wrap break-words select-text" id="submitted-prompt">
                {submitted.prompt}
              </div>
              <div className="border-t border-white/10 p-2 flex justify-end gap-2">
              <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    form.reset()
                    setSubmitted(null)
                    form.setFocus('name')
                    if (promptTimerRef.current) clearInterval(promptTimerRef.current)
                    promptTimerRef.current = null
                    setPromptTimerStarted(false)
                    setPromptSecondsLeft(60)
                    setPromptLocked(false)
                  }}
                >
                  Reset Form
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(submitted.prompt)
                      setCopied(true)
                    } catch (_) {
                      const textarea = document.createElement('textarea')
                      textarea.value = submitted.prompt
                      document.body.appendChild(textarea)
                      textarea.select()
                      document.execCommand('copy')
                      document.body.removeChild(textarea)
                      setCopied(true)
                    }
                  }}
                >
                  {copied ? 'Copied!' : 'Copy to clipboard'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        </div>
      </main>
      <footer className="bg-gray-900/40 border-t border-white/10">
        <div className="max-w-screen-xl mx-auto px-6 py-8 lg:px-8">
          <div className="flex items-center">
            <img src="/logo.svg" alt="TJHSST Dev Club" className="h-10 w-auto" />
            <span className="ml-3 text-sm text-gray-400">&copy; {new Date().getFullYear()} TJHSST Dev Club</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
