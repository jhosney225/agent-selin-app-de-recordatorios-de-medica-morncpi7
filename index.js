
```javascript
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as readline from "readline";

const client = new Anthropic();

// Data persistence
const DATA_FILE = "medications.json";

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  times: string[];
  startDate: string;
  endDate: string;
  notes: string;
}

interface MedicationData {
  medications: Medication[];
  lastChecked: string;
}

// Load medications from file
function loadMedications(): MedicationData {
  if (fs.existsSync(DATA_FILE)) {
    const data = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(data);
  }
  return { medications: [], lastChecked: new Date().toISOString() };
}

// Save medications to file
function saveMedications(data: MedicationData): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Check for due medications
function checkDueMedications(data: MedicationData): Medication[] {
  const now = new Date();
  const currentTime = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");
  const currentDate = now.toISOString().split("T")[0];

  return data.medications.filter((med) => {
    const startDate = new Date(med.startDate);
    const endDate = new Date(med.endDate);

    if (currentDate < startDate.toISOString().split("T")[0] || currentDate > endDate.toISOString().split("T")[0]) {
      return false;
    }

    return med.times.some((time) => {
      const [hour, minute] = time.split(":").map(Number);
      const nowHour = now.getHours();
      const nowMinute = now.getMinutes();
      return nowHour === hour && Math.abs(nowMinute - minute) <= 5;
    });
  });
}

// Format medication info for display
function formatMedicationInfo(medication: Medication): string {
  return `
Medication: ${medication.name}
- Dosage: ${medication.dosage}
- Frequency: ${medication.frequency}
- Scheduled times: ${medication.times.join(", ")}
- Duration: ${medication.startDate} to ${medication.endDate}
- Notes: ${medication.notes || "None"}`;
}

// Main chat function with Claude
async function chatWithClaude(userMessage: string, data: MedicationData): Promise<string> {
  // Check for due medications
  const dueMedications = checkDueMedications(data);

  // Prepare context about medications
  let medicationContext = "Current medications in the system:\n";
  if (data.medications.length > 0) {
    medicationContext += data.medications.map((med, i) => `${i + 1}. ${med.name} - ${med.dosage}, ${med.frequency}`).join("\n");
  } else {
    medicationContext += "No medications registered yet.";
  }

  if (dueMedications.length > 0) {
    medicationContext += "\n\nALERT - Medications due now:\n";
    medicationContext += dueMedications.map((med) => `- ${med.name} (${med.dosage})`).join("\n");
  }

  const systemPrompt = `You are a helpful medication reminder assistant. You help users manage their medication schedules and health reminders.

${medicationContext}

You can help users:
1. Add new medications
2. View their medication schedule
3. Get reminders about due medications
4. Remove or update medications
5. Get health-related advice about medication timing

When a user wants to add a medication, ask for: name, dosage, frequency, times to take it, start date, end date, and any notes.
When suggesting actions, be clear and concise.
If medications are due, always alert the user.`;

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: userMessage,
    },
  ];

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages,
  });

  const assistantMessage = response.content[0];
  if (assistantMessage.type === "text") {
    return assistantMessage.text;
  }
  return "Unable to process response";
}

// Parse medication from user input
function parseMedicationFromInput(input: string): Partial<Medication> | null {
  // Simple pattern matching for medication info
  const medicationPattern =
    /add medication:?\s+name[:\s]+([^,]+)[,\s]+dosage[:\s]+([^,]+)[,\s]+frequency[:\s]+([^,]+)[,\s]+times[:\s]+([^,]+)[,\s]+start[:\s]+(\d{4}-\d{2}-\d{2})[,\s]+end[:\s]+(\d{4}-\d{2}-\d{2})/i;

  const match = input.match(medicationPattern);
  if (match) {
    return {
      id: generateId(),
      name: match[1].trim(),
      dosage: match[2].trim(),
      frequency: match[3].trim(),
      times: match[4].split(",").map((t) => t.trim()),
      startDate: match[5],
      endDate: match[6],
      notes: "",
    };
  }
  return null;
}

// Interactive chat loop
async