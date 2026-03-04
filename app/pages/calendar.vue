<script setup lang="ts">
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <section class="studio-grid overflow-hidden rounded-[2rem] border border-[color:var(--gruv-line)] px-5 py-6 sm:px-8 sm:py-8">
      <div class="grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_20rem]">
        <div class="space-y-5">
          <span class="studio-kicker">Open schedule</span>
          <div class="max-w-3xl space-y-4">
            <h1 class="studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-7xl">
              See when the room is clear, then build your day around it.
            </h1>
            <p class="max-w-2xl text-base leading-8 text-[color:var(--gruv-ink-2)] sm:text-lg">
              This view shows booked sessions and hold windows so you can quickly spot the best openings for portrait sets,
              product days, test shoots, or client work. Members can book from their dashboard. Guests can use the public booking flow.
            </p>
          </div>

          <AvailabilityCalendar endpoint="/api/calendar/public" />
        </div>

        <div class="space-y-4">
          <div class="studio-panel p-5">
            <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
              Reading the calendar
            </div>
            <div class="mt-4 space-y-3 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              <p>Warm blocks mark hold windows where a set stays built overnight.</p>
              <p>Neutral blocks show confirmed bookings that are no longer available.</p>
              <p>Use week view for planning. Switch to day view when you need a tight read on turnaround time.</p>
            </div>
          </div>

          <div class="studio-panel p-5">
            <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
              Best next move
            </div>
            <div class="mt-4 space-y-3 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              <p>If you are comparing plans, start with memberships so you can book with credits and priority windows.</p>
              <p>If you need a one-off date right away, guest booking is available on the public booking flow.</p>
            </div>
            <div class="mt-5 flex flex-col gap-2">
              <UButton to="/memberships">
                Explore memberships
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                to="/book"
              >
                Book as a guest
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  </UContainer>
</template>
