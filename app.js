const CLINIC_URL = 'https://mjjnysahorvkrnawlwdm.supabase.co';
const CLINIC_KEY = 'sb_publishable_FzNqpf2JHbAjMfRJUMKGYg_4n68k_YW';
const sbClient = supabase.createClient(CLINIC_URL, CLINIC_KEY);

const form = document.getElementById('booking-form');
const submitBtn = document.getElementById('submit-btn');
const resultDiv = document.getElementById('result');
const dateInput = document.getElementById('b-date');

const phoneInput = document.getElementById('b-phone');
const patientSelectionContainer = document.getElementById('patient-selection-container');
const patientList = document.getElementById('patient-list');
const phoneLoading = document.getElementById('phone-loading');

// Set min date to today
const today = new Date().toLocaleDateString('sv-SE');
dateInput.min = today;
dateInput.value = today;

dateInput.addEventListener('change', (e) => {
    if (!e.target.value) return;
    const selectedDate = new Date(e.target.value);
    if (selectedDate.getDay() === 5) {
        alert('ببورە، کلینیک لە ڕۆژانی هەینی داخراوە. تکایە ڕۆژێکی تر هەڵبژێرە.');
        e.target.value = '';
    }
});

let selectedPatientId = null;
let searchTimeout = null;

phoneInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const val = e.target.value.trim();
    
    // Convert Arabic/Kurdish numerals to English
    const englishVal = val.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    
    // Extract only digits
    const cleanDigits = englishVal.replace(/\D/g, '');
    
    if (cleanDigits.length >= 6) {
        searchTimeout = setTimeout(async () => {
            phoneLoading.style.display = 'block';
            patientSelectionContainer.style.display = 'none';
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';
            
            // Create fuzzy pattern like %0%7%5%0% to ignore spaces and dashes in DB
            const fuzzyPattern = '%' + cleanDigits.split('').join('%') + '%';
            
            try {
                const { data: rpcData, error } = await sbClient
                    .rpc('search_patient_by_phone', { phone_query: fuzzyPattern });
                    
                phoneLoading.style.display = 'none';
                
                if (error) throw error;
                
                // Supabase RPC returns the JSON array directly
                const data = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
                
                if (data && data.length > 0) {
                    patientList.innerHTML = '';
                    
                    data.forEach((p) => {
                        const label = document.createElement('label');
                        label.className = 'patient-option';
                        
                        const radio = document.createElement('input');
                        radio.type = 'radio';
                        radio.name = 'patient_id_select';
                        radio.value = p.id;
                        radio.dataset.patientName = p.name;
                        
                        radio.addEventListener('change', () => {
                            selectedPatientId = p.id;
                            // Add selected class to the chosen label
                            document.querySelectorAll('.patient-option').forEach(el => el.classList.remove('selected'));
                            label.classList.add('selected');
                            
                            submitBtn.disabled = false;
                            submitBtn.style.opacity = '1';
                        });
                        
                        const text = document.createElement('span');
                        text.innerText = `${p.name} (${p.phone})`;
                        
                        label.appendChild(radio);
                        label.appendChild(text);
                        patientList.appendChild(label);
                    });
                    
                    patientSelectionContainer.style.display = 'block';
                } else {
                    // No patient found
                    selectedPatientId = null;
                    patientList.innerHTML = '<div style="color: #b91c1c; padding: 10px; background: #fee2e2; border-radius: 8px;">ببورە، ئەم ژمارەیە لە سیستەمەکەماندا نییە.</div>';
                    patientSelectionContainer.style.display = 'block';
                    submitBtn.disabled = true;
                    submitBtn.style.opacity = '0.7';
                }
            } catch (err) {
                console.error(err);
                phoneLoading.style.display = 'none';
            }
        }, 500);
    } else {
        patientSelectionContainer.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.7';
    }
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const phone = document.getElementById('b-phone').value.trim();
    const date = document.getElementById('b-date').value;
    
    if (!selectedPatientId || !phone || !date) {
        showResult('تکایە هەموو زانیارییەکان پڕبکەرەوە.', false);
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.innerText = 'چاوەڕێ بە...';
    resultDiv.style.display = 'none';
    
    try {
        // 1. Fetch appointments for this date via RPC
        const { data: rpcQueue, error: qError } = await sbClient
            .rpc('get_queue_info_for_date', { target_date: date });
            
        if (qError) throw qError;
        
        const queueData = typeof rpcQueue === 'string' ? JSON.parse(rpcQueue) : (rpcQueue || []);
        const queueCount = queueData.length;
        
        // Settings: Max 10 patients per day, Start at 13:30
        const MAX_PATIENTS = 10;
        
        if (queueCount >= MAX_PATIENTS) {
            showResult('ببورە، بۆ ئەم ڕۆژە هیچ نۆرەیەک نەماوە. تکایە ڕۆژێکی تر هەڵبژێرە.', false);
            submitBtn.disabled = false;
            submitBtn.innerText = 'وەرگرتنی نۆرە';
            return;
        }
        
        // Calculate Time
        let currentHour = 13;
        let currentMin = 30;
        
        if (queueCount > 0) {
            const lastPatient = queueData[queueCount - 1];
            if (lastPatient.appointment_time) {
                const parts = lastPatient.appointment_time.split(':');
                if (parts.length >= 2) {
                    currentHour = parseInt(parts[0]);
                    currentMin = parseInt(parts[1]);
                }
            }
        }
        
        // Add 30 mins to the last patient's time
        if (queueCount > 0) {
            currentMin += 30;
            if (currentMin >= 60) {
                currentMin -= 60;
                currentHour += 1;
            }
        }
        
        // Hard limit on end time (~18:00)
        if (currentHour >= 18) {
            showResult('ببورە، کاتەکانی ئەم ڕۆژە پڕ بوونە. تکایە ڕۆژێکی تر هەڵبژێرە.', false);
            submitBtn.disabled = false;
            submitBtn.innerText = 'وەرگرتنی نۆرە';
            return;
        }
        
        const formattedTime24 = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;
        
        // Format for display (12-hour AM/PM)
        const ampm = currentHour >= 12 ? 'PM' : 'AM';
        const displayHour = currentHour > 12 ? currentHour - 12 : (currentHour === 0 ? 12 : currentHour);
        const displayTime = `${String(displayHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')} ${ampm}`;
        
        // Actually for the clinic system they use 24h format! I must save it as 24h.
        
        const queueNumber = queueCount + 1;
        
        // 2. Patient
        let patientId = selectedPatientId;
        let patientNameToSave = '';
        
        const selectedRadio = document.querySelector('input[name="patient_id_select"]:checked');
        if (selectedRadio) {
            patientNameToSave = selectedRadio.dataset.patientName;
        } else {
            showResult('تکایە ناوەکەت هەڵبژێرە.', false);
            submitBtn.disabled = false;
            submitBtn.innerText = 'وەرگرتنی نۆرە';
            return;
        }
        
        // 3. Add to Queue via RPC
        const newQueue = {
            patient_id: patientId,
            patient_name: patientNameToSave,
            queue_number: queueNumber,
            appointment_time: formattedTime24, 
            services_used: [],
            subtotal: 0,
            discount_amount: 0,
            discount_note: "",
            final_total: 0,
            paid: 0,
            debt: 0,
            method: "cash",
            status: 'waiting',
            date: date,
            notes: "بە ئۆنلاین سڕەی گرتوە ",
            is_deleted: false,
            is_payment_only: false
        };
        
        const { error: insertQueueError } = await sbClient
            .rpc('book_patient_appointment', { queue_data: newQueue });
            
        if (insertQueueError) throw insertQueueError;
        
        // 4. Show Ticket
        showTicket(patientNameToSave, date, displayTime, queueNumber);
        
    } catch (err) {
        console.error(err);
        showResult('هەڵەیەک ڕوویدا لە کاتی وەرگرتنی نۆرە، تکایە ئینتەرنێتەکەت بپشکنە.', false);
        submitBtn.disabled = false;
        submitBtn.innerText = 'وەرگرتنی نۆرە';
    }
});

function showResult(message, isSuccess) {
    resultDiv.style.display = 'block';
    resultDiv.className = isSuccess ? 'success' : 'error';
    resultDiv.innerText = message;
}

function showTicket(name, date, time, qNum) {
    form.style.display = 'none';
    resultDiv.style.display = 'block';
    resultDiv.className = 'ticket';
    resultDiv.innerHTML = `
        <h3>نۆرەکەت بە سەرکەوتوویی گیرا</h3>
        <h2>سڕەی ژمارە ${qNum}</h2>
        
        <p style="font-size: 1.1rem; color: var(--primary-dark); font-weight: bold; margin: 15px 0 25px; padding: 10px; background: rgba(14, 165, 233, 0.1); border-radius: 8px;">
            کاتی چوونە ژوورەوەت بە نزیکەیی کاتژمێر <span style="font-size: 1.25rem;">${time}</span> دەبێت
        </p>

        <div class="info">
            <div>نەخۆش:</div>
            <span>${name}</span>
        </div>
        <div class="info">
            <div>بەروار:</div>
            <span>${date}</span>
        </div>
        <hr>
        <p style="font-size: 0.9rem; color: #64748b;">تکایە لە کاتی دیاریکراودا ئامادەبە لە نۆڕینگە. ئەگەر ناتوانیت ئامادەبیت تکایە پەیوەندیمان پێوە بکە.</p>
       <p style="font-size: 0.9rem; color: #64748b;"> ژمارەى مۆبایل: 07510264346
</p>
        <button class="btn" style="margin-top: 20px;" onclick="location.reload()">نۆرەیەکی تر بگرە</button>
    `;
}
