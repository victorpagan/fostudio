<script setup lang="ts">
</script>

<template>
  <UContainer class="py-10">
    <div class="max-w-3xl">
      <h1 class="text-3xl font-semibold tracking-tight">Calendar</h1>
    </div>

    <AvailabilityCalendar endpoint="/api/calendar/public" />
  </UContainer>
</template>
