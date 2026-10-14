export function Landing() {
  return (
    <div className="landing">
      <section className="hero">
        <h1>
          See<span className="accent">Your</span>Voice
        </h1>
        <p className="lead">
          Speak, and watch your voice appear as notes on a keyboard and a live pitch graph, alongside pace, pauses and filler words.
          Practise with instant visual feedback and improve how you come across.
        </p>
        <p className="muted">
          A voice-training instrument, not a music tool: the notes are just a way to <em>see</em> pitch movement. You never need to hit
          a note.
        </p>
        <div className="controls">
          <a className="btn btn-primary btn-lg" href="#/studio">
            Start Practising
          </a>
          <a className="btn btn-ghost btn-lg" href="#/practice">
            Guided practice
          </a>
        </div>
      </section>

      <section className="panel privacy" aria-labelledby="privacy-h">
        <h2 id="privacy-h">Your microphone, your device</h2>
        <ul>
          <li>The microphone turns on only when you press Start, and off when you stop or leave the screen.</li>
          <li>Pitch analysis runs in your browser. No audio is uploaded by SeeYourVoice.</li>
          <li>Recording audio, saving sessions and transcription are each opt-in. Saved data stays on this device and you can delete it any time in Settings.</li>
          <li>
            Transcription (for words per minute and filler words) uses your browser’s speech recognition, which in Chrome and Edge sends audio to the
            browser vendor’s service. It is off unless you tick it.
          </li>
        </ul>
      </section>

      <section aria-labelledby="modes-h">
        <h2 id="modes-h">Practice modes</h2>
        <ul className="mode-grid">
          <li>
            <a href="#/studio">
              <strong>Live Studio</strong>
              <span>Free speak: build awareness of your habitual pitch patterns.</span>
            </a>
          </li>
          <li>
            <a href="#/practice/pitch">
              <strong>Pitch variation</strong>
              <span>Same passage, four intentions. Compare the contours.</span>
            </a>
          </li>
          <li>
            <a href="#/practice/cadence">
              <strong>Pause &amp; cadence</strong>
              <span>Rehearse phrase breaks and compare them with suggested ones.</span>
            </a>
          </li>
          <li>
            <a href="#/practice/presentation">
              <strong>Presentation</strong>
              <span>A timed 30–60 s run with a transparent summary.</span>
            </a>
          </li>
          <li>
            <a href="#/practice/custom">
              <strong>Custom passage</strong>
              <span>Paste your own script, or use the built-in example.</span>
            </a>
          </li>
        </ul>
      </section>

      <p className="muted small">
        Measurements are estimates. SeeYourVoice does not claim to measure confidence, persuasiveness or communication quality from audio alone.
      </p>
    </div>
  );
}
