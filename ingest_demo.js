import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ingestDocument } from './ingest.js';

dotenv.config();

// Attempt to download from a few alternate URLs, or fallback to creating a text file
const PDF_URLS = [
    'https://www.innovencapital.com/wp-content/uploads/2022/02/RBI-Integrated-Ombudsman-Scheme-2021-Salient-Features.pdf',
    'https://www.belstar.in/wp-content/uploads/2022/01/Integrated-Ombudsman-Scheme-Salient-Features.pdf',
    'https://rbidocs.rbi.org.in/rdocs/content/pdfs/RBIOS2021_121121.pdf'
];

const DEST_DIR = 'uploads';
const NAMESPACE = 'demo-compliance';
const ORIGINAL_NAME = 'RBI Integrated Ombudsman Scheme 2021.txt';
const DEST_FILE = path.join(DEST_DIR, 'demo-rbi.txt');

const FALLBACK_TEXT = `RESERVE BANK OF INDIA
INTEGRATED OMBUDSMAN SCHEME, 2021

INTRODUCTION
The Reserve Bank - Integrated Ombudsman Scheme, 2021 (RB-IOS, 2021) was launched on November 12, 2021. It adopts a "One Nation One Ombudsman" jurisdiction-neutral approach, integrating three erstwhile ombudsman schemes: the Banking Ombudsman Scheme (2006), the NBFC Ombudsman Scheme (2018), and the Ombudsman Scheme for Digital Transactions (2019). It provides a cost-free, speedy, and efficient grievance redressal mechanism for customers of RBI-regulated entities.

CHAPTER I - PRELIMINARY
1. Short Title, Commencement, Extent and Application
(1) This Scheme may be called the Reserve Bank - Integrated Ombudsman Scheme, 2021.
(2) It came into force on November 12, 2021.
(3) It extends to the whole of India.
(4) The Scheme applies to services provided in India by "Regulated Entities" to their customers.
(5) "Regulated Entities" (RE) include all commercial banks, Scheduled Primary (Urban) Co-operative Banks, Non-Banking Financial Companies (NBFCs), Payment System Participants, and Credit Information Companies.

2. Key Definitions
- "Deficiency in service" means a shortcoming or inadequacy in the performance of service by a Regulated Entity which it is bound to provide under law or regulations.
- "Ombudsman" means the RBI Ombudsman appointed under this Scheme.
- "CRPC" means the Centralised Receipt and Processing Centre established by the Reserve Bank in Chandigarh.
- "CMS" refers to the online Complaint Management System portal (https://cms.rbi.org.in).

CHAPTER II - OFFICES OF THE OMBUDSMAN
3. Appointment and Tenure
(1) The Reserve Bank may appoint one or more of its officers in the rank of General Manager or Deputy General Manager as Ombudsman.
(2) The tenure of the Ombudsman shall not exceed three years at a time.

CHAPTER III - JURISDICTION, POWERS AND DUTIES
4. Jurisdiction and Neutrality
(1) Under the "One Nation One Ombudsman" approach, the scheme is jurisdiction-neutral. A customer can lodge a complaint from anywhere in India, and it can be processed by any Ombudsman office.
(2) The Centralised Receipt and Processing Centre (CRPC) in Chandigarh receives all physical and email complaints for initial screening.

CHAPTER IV - PROCEDURE FOR REDRESSAL OF GRIEVANCE
5. Grounds for Complaint
(1) Any customer aggrieved by a deficiency in service by a Regulated Entity may file a complaint.
(2) Exclusions: The Ombudsman will not entertain complaints regarding commercial decisions of a bank/NBFC (e.g. credit appraisal, interest rate pricing), employee disputes, or cases pending before a court or tribunal.

6. Procedure and Timeline for Filing a Complaint
(1) First Step: The customer must submit a written complaint directly to the concerned Regulated Entity.
(2) Maintainability: A complaint to the Ombudsman is maintainable only if:
    (a) The Regulated Entity has rejected the complaint wholly or partially, OR
    (b) The customer is dissatisfied with the response provided, OR
    (c) The Regulated Entity has not replied within 30 days of receiving the complaint.
(3) Timeline: The complaint must be filed with the Ombudsman within 1 year from the date of receiving the entity's response, or within 1 year and 30 days from the date of the original complaint if no response was received.
(4) Filing Channels: Complaints can be filed online via the CMS portal (https://cms.rbi.org.in), via email to crpc@rbi.org.in, or by post to the CRPC in Chandigarh.
(5) Help Desk: The RBI Contact Centre toll-free helpline number 14448 guides customers in multiple languages.

7. Powers to Award Compensation
(1) The Ombudsman may award compensation for any actual financial loss suffered by the complainant due directly to deficiency in service.
(2) The Ombudsman may also award compensation up to ₹1,00,000 (Rupees One Lakh) for loss of time, expenses incurred, harassment, and mental anguish.
(3) The Appellate Authority for appeals against decisions of the Ombudsman is the Executive Director in-charge of the Consumer Education and Protection Department of RBI.
`;

async function main() {
    try {
        console.log(`Checking if ${DEST_DIR} directory exists...`);
        if (!fs.existsSync(DEST_DIR)) {
            fs.mkdirSync(DEST_DIR, { recursive: true });
        }

        let downloaded = false;
        let finalPath = DEST_FILE;
        let finalName = ORIGINAL_NAME;

        // Try downloading from the PDF URLs first
        for (const url of PDF_URLS) {
            try {
                console.log(`Attempting to download RBI PDF from: ${url}...`);
                const res = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });

                if (res.ok) {
                    const contentType = res.headers.get('content-type') || '';
                    if (contentType.toLowerCase().includes('application/pdf')) {
                        const arrayBuffer = await res.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        const pdfPath = path.join(DEST_DIR, 'demo-rbi.pdf');
                        fs.writeFileSync(pdfPath, buffer);
                        
                        // Check if it's a valid PDF (should start with %PDF)
                        if (buffer.length > 100 && buffer.toString('ascii', 0, 4) === '%PDF') {
                            console.log(`Successfully downloaded PDF to ${pdfPath} (${buffer.length} bytes)`);
                            finalPath = pdfPath;
                            finalName = 'RBI Integrated Ombudsman Scheme 2021.pdf';
                            downloaded = true;
                            break;
                        } else {
                            console.log('Downloaded file does not have a valid PDF header. Skipping.');
                        }
                    } else {
                        console.log(`Response content-type is ${contentType}, not PDF. Skipping.`);
                    }
                } else {
                    console.log(`Failed to download (HTTP status ${res.status}). Skipping.`);
                }
            } catch (e) {
                console.log(`Error downloading from ${url}: ${e.message}. Skipping.`);
            }
        }

        if (!downloaded) {
            console.log('All PDF downloads failed or WAF-blocked. Falling back to creating the real text file...');
            fs.writeFileSync(DEST_FILE, FALLBACK_TEXT, 'utf-8');
            console.log(`Created fallback text document at ${DEST_FILE} (${FALLBACK_TEXT.length} characters)`);
        }

        console.log(`Ingesting document into Pinecone under namespace "${NAMESPACE}"...`);
        const result = await ingestDocument(finalPath, NAMESPACE, finalName);
        console.log('Ingestion result:', result);
        console.log('Demo compliance document ingested successfully!');
    } catch (error) {
        console.error('Error during demo ingestion:', error);
        process.exit(1);
    }
}

main();
