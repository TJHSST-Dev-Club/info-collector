import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import "./App.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
});

type FormValues = z.infer<typeof formSchema>;

function App() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "" },
    mode: "onSubmit",
    reValidateMode: "onSubmit",
  });

  useEffect(() => {
    if (!submitted) return;
    const timeout = window.setTimeout(() => {
      form.reset();
      setSubmitted(false);
      window.requestAnimationFrame(() => {
        form.setFocus("name");
      });
    }, 2500);
    return () => window.clearTimeout(timeout);
  }, [submitted, form]);

  const onSubmit = async (values: FormValues) => {
    setSubmitted(false);
    try {
      const response = await fetch("http://localhost:8787/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error("Submission failed");
      setSubmitted(true);
      confetti({
        particleCount: 140,
        spread: 80,
        origin: { y: 0.72 },
        colors: ["#5ac1ea", "#7779dc", "#eaecf4"],
        disableForReducedMotion: true,
      });
    } catch {
      form.setError("root", { message: "We couldn’t save your information. Please try again." });
    }
  };

  return (
    <div className="dark flex min-h-screen flex-col bg-ink text-fog">
      <header className="border-b border-border bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <a href="https://tjdev.club" className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="h-10 w-auto" />
            <span className="text-[19px] font-semibold tracking-tight">TJ Dev Club</span>
          </a>
          <a href="https://tjdev.club" className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-mist transition-colors hover:text-fog">
            tjdev.club
          </a>
        </div>
      </header>

      <main className="relative flex flex-1 items-center overflow-hidden">
        <div className="ambient-glow" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-xl px-6 py-16 sm:py-24">
          <section className="text-center">
            <h1 className="font-display bg-clip-text text-4xl font-semibold tracking-[-0.03em] text-balance text-transparent [background-image:linear-gradient(to_bottom,#fff_62%,rgba(234,236,244,0.62))] sm:text-5xl">
              Join TJ Dev Club.
            </h1>
            <p className="mx-auto mt-4 max-w-md text-[16px] leading-relaxed text-mist">
              Leave your name and email to stay updated.
            </p>
          </section>

          <section aria-label="Join form" className="mx-auto mt-10 w-full max-w-md">
            <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                      <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl><Input placeholder="Your name" autoComplete="name" className="h-11 rounded-lg border-border bg-ink/55 px-4 text-fog placeholder:text-mist/45 focus-visible:border-brand/50" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input placeholder="you@example.com" type="email" autoComplete="email" className="h-11 rounded-lg border-border bg-ink/55 px-4 text-fog placeholder:text-mist/45 focus-visible:border-brand/50" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      {form.formState.errors.root ? <p className="text-sm text-red-300" role="alert">{form.formState.errors.root.message}</p> : null}
                      <Button type="submit" disabled={form.formState.isSubmitting || submitted} className="h-11 w-full rounded-full bg-fog px-6 text-ink hover:bg-white">
                        {form.formState.isSubmitting ? "Joining…" : submitted ? "Added" : "Join the list"}
                      </Button>
                      {submitted ? (
                        <p className="text-center text-sm text-brand" role="status">
                          You’re on the list. Thanks for joining us!
                        </p>
                      ) : null}
                    </form>
            </Form>
          </section>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-center px-6 py-6 text-xs text-mist/60">
          <span>&copy; {new Date().getFullYear()} TJ Dev Club</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
