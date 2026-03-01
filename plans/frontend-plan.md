# AdCraft Frontend — React + Vite UI

**Status: DRAFT** (March 1, 2026)

## 1. Problem Statement

AdCraft has a working backend API for AI ad video generation and critique, but no user interface. Users must interact via raw API calls (curl/Postman), making the product unusable for anyone who isn't a developer. A responsive web frontend is needed to make ad creation and iterative improvement accessible.

## 2. Solution Overview

A single-page React + Vite application that guides users through an iterative ad creation loop: enter a concept, generate a video ad, watch it, run AI critique, see what's missing, and regenerate with improvements. The UI uses polling-based live progress updates (similar to autonomous-writer) to show pipeline stages as they complete. Mobile-first responsive design ensures usability on phone and desktop.

## 3. Comparison Table

| Aspect | Current (API only) | Frontend |
|--------|-------------------|----------|
| Target user | Developer with curl | Anyone with a browser |
| Interaction | POST JSON, poll job ID | Fill form, watch progress, iterate |
| Progress visibility | Poll raw JSON status | Live stage progress with visual indicators |
| Video playback | Copy S3 URL, open separately | Inline video player |
| Critique workflow | Separate API call, read JSON | One-click critique with visual scoring |
| Iteration | Manually re-submit with edits | Edit concept inline, regenerate |

## 4. User Flow

```
1. User opens AdCraft in browser
2. Sees a clean landing view with a concept input and "Generate Ad" button
3. Types ad concept: "Ember Roast — premium dark roast coffee for adventurers"
4. Optionally adjusts settings: number of clips (3-8), duration (15-60s),
   aspect ratio (16:9, 9:16, 1:1), resolution (480p, 720p)
5. Clicks "Generate Ad"
6. UI shows a progress panel with pipeline stages:
   - Writing script... ✓
   - Creating clip prompts... ✓
   - Generating clips (3/5)... (with individual clip status)
   - Analyzing clips... ✓
   - Assembling video...
7. When complete, video player appears with the final ad
8. Below the video, a "Critique This Ad" button
9. User clicks critique — loading spinner for ~25 seconds
10. Critique card appears:
    - Score: 3/10
    - Top weakness: "No brand logo or product shot"
    - Strengths listed
    - Recommendation for next iteration
11. User edits concept to address the critique, clicks "Regenerate"
12. Repeat from step 6
13. History sidebar shows all previous generations with thumbnails
```

## 5. Scope

### In Scope (P0 — Must Have)

- **Concept input form** with text area and settings (clips, duration, aspect ratio, resolution)
- **Generate button** that creates a job via POST /api/generate
- **Live progress view** polling GET /api/jobs/{id} every 2-3 seconds, showing pipeline stage
- **Video player** displaying the final video inline when job completes
- **Critique button** that submits POST /api/critique with the video URL
- **Critique results card** showing score, top weakness, strengths, recommendation
- **Error states** for failed jobs with error message display
- **Responsive layout** that works on mobile (375px+) and desktop
- **Job history list** showing recent jobs with status, concept snippet, and video thumbnail
- **Loading/empty states** for all views

### Should Have (P1)

- **Iteration tracking** — link critique results to the next generation, show improvement over time
- **Script preview** — show the generated script before/during clip generation
- **Clip gallery** — show individual clips with their prompts before final assembly
- **Dark mode** toggle
- **Copy/share video URL** button

### Out of Scope (v2+)

- User authentication / accounts
- Saved projects or workspaces
- Direct video editing in the browser
- Custom style/brand upload
- Multi-user collaboration
- Payment / usage limits
- Backend changes (API is already complete)

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Long generation time (~13 min) makes UI feel broken | High | Clear progress stages with elapsed time counter; disable form during generation |
| Polling creates unnecessary load | Low | Poll every 3s, stop on completion/failure, exponential backoff on errors |
| Large video files slow page load | Med | Lazy load video player, show thumbnail first, stream via S3 URL |
| Mobile video playback quirks (autoplay blocked) | Med | Manual play button, test on iOS Safari and Chrome Android |
| CORS issues between Vite dev server and FastAPI | Low | Add CORS middleware to FastAPI with localhost origins |

## 7. Success Criteria Checklist

### Form & Input
- [ ] Concept text area accepts input and has a character counter
- [ ] Settings controls (clips, duration, aspect ratio, resolution) have sensible defaults
- [ ] Generate button is disabled when concept is empty
- [ ] Generate button is disabled while a job is in progress
- [ ] Form retains concept text after generation completes (for easy iteration)

### Job Progress
- [ ] Submitting the form creates a job and shows the progress view
- [ ] Progress view polls the job endpoint every 3 seconds
- [ ] Progress view displays the current pipeline stage name
- [ ] Progress view shows elapsed time since job started
- [ ] Polling stops when job status is "completed" or "failed"
- [ ] Failed job shows error message with a "Try Again" button

### Video Playback
- [ ] Completed job shows an inline video player with the final video
- [ ] Video player has play/pause controls
- [ ] Video URL is from the job output (not hardcoded)

### Critique Flow
- [ ] "Critique This Ad" button appears after video generation completes
- [ ] Clicking critique creates a critique job and shows a loading state
- [ ] Critique results display: score (as a visual indicator), top weakness, strengths list, recommendation
- [ ] User can edit the concept and click "Regenerate" after reading critique

### Job History
- [ ] Recent jobs are listed with job type, status, and concept snippet
- [ ] Clicking a job in history loads its results (video + critique if available)
- [ ] History updates when a new job completes

### Responsive Design
- [ ] Layout works at 375px width (mobile)
- [ ] Layout works at 1024px+ width (desktop)
- [ ] All inputs use font-size 16px or larger (no iOS zoom)
- [ ] No horizontal scroll on any viewport width
- [ ] Touch targets are at least 44x44px on mobile

### No Regressions
- [ ] Backend API still works via curl after adding CORS
- [ ] GET /health returns healthy
- [ ] Existing job data in MongoDB is still accessible

## 8. End-to-End Test List

**E2E-1: Happy path — Generate and watch**
1. Open the app in a browser
2. Enter concept: "Sunset Coffee — golden hour blend"
3. Set clips to 3, duration to 15s
4. Click "Generate Ad"
5. Verify: progress view appears with stage names
6. Wait for completion (or mock the job response)
7. Verify: video player renders with a playable video
8. Verify: "Critique This Ad" button is visible

**E2E-2: Critique flow**
1. Complete E2E-1
2. Click "Critique This Ad"
3. Verify: loading indicator appears
4. Wait for critique job to complete
5. Verify: score, weakness, strengths, and recommendation display
6. Verify: concept input still has original text
7. Edit concept to address weakness
8. Click "Regenerate"
9. Verify: new generation job starts

**E2E-3: Error handling**
1. Submit a generate job with an empty concept (button should be disabled)
2. If a job fails (simulate via API), verify error message and retry button appear
3. Verify: app does not crash on API timeout or network error

**E2E-4: Job history**
1. Generate 2 ads with different concepts
2. Verify: both appear in history list
3. Click the first job in history
4. Verify: its video and details load correctly

**E2E-5: Mobile responsiveness**
1. Open app at 375px viewport width
2. Verify: form, progress, video player, and critique all render without horizontal scroll
3. Verify: all inputs are tappable without zooming
4. Verify: video player fits within viewport

## 9. Manual Testing Checklist (Post-Deploy)

### Quick Smoke Test (2 min)
- [ ] App loads at root URL without errors
- [ ] Concept input accepts text and settings dropdowns work
- [ ] Generate button becomes active when concept is entered

### Feature Check (5 min)
- [ ] Submit a generate job — progress view updates through stages
- [ ] Completed job shows video player with working playback
- [ ] Critique button appears and creates a critique job
- [ ] Critique results display score and recommendations
- [ ] Edit concept and regenerate — new job starts

### History & Navigation (2 min)
- [ ] Job history shows recent jobs
- [ ] Clicking a past job loads its results
- [ ] Page refresh preserves ability to view history

### Responsive (2 min)
- [ ] Resize to mobile width — no horizontal scroll, all controls usable
- [ ] Test on actual phone if available — inputs don't trigger zoom
