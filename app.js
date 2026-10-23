/**
 * STADA Pro - Sistema de Triagem, Auditoria Documental e Análise de Crédito
 * Versão otimizada com conversão rápida client-side (PDF.js), ZIP, Recibo PDF e Regras Refinadas de Renda/IRPF
 */

document.addEventListener('DOMContentLoaded', () => {
    // Configurar Worker do PDF.js
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const DEFAULT_API_KEY = "AIzaSyCD_PAAD6QRRg6j_BWWaITbFlfzBFtrEvk";

    const apiKeyInput = document.getElementById('apiKeyInput');
    const toggleApiKeyBtn = document.getElementById('toggleApiKey');
    const eyeIcon = document.getElementById('eyeIcon');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const apiKeyStatus = document.getElementById('apiKeyStatus');

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const fileInfoCard = document.getElementById('fileInfoCard');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const fileTypeIcon = document.getElementById('fileTypeIcon');
    const analyzeBtn = document.getElementById('analyzeBtn');

    const loadingContainer = document.getElementById('loadingContainer');
    const loadingText = document.getElementById('loadingText');
    const errorMessage = document.getElementById('errorMessage');
    const resultsContainer = document.getElementById('resultsContainer');

    const resumoExecutivoText = document.getElementById('resumoExecutivoText');
    const totalPessoasCount = document.getElementById('totalPessoasCount');
    const pessoasCardsList = document.getElementById('pessoasCardsList');
    const globalActions = document.getElementById('globalActions');
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    const fatiarPdfGeralBtn = document.getElementById('fatiarPdfGeralBtn');

    const pdfIframe = document.getElementById('pdfIframe');
    const imageViewer = document.getElementById('imageViewer');
    const viewerPlaceholder = document.querySelector('.viewer-placeholder');
    const currentPageIndicator = document.getElementById('currentPageIndicator');

    let currentFile = null;
    let fileArrayBuffer = null;
    let fileBlobUrl = null;
    let lastAnalysisResult = null;

    // Gerenciamento da API Key
    const savedApiKey = localStorage.getItem('STADA_GEMINI_KEY');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
        showApiKeyStatus('Chave salva no navegador', 'var(--success)');
    } else {
        apiKeyInput.value = DEFAULT_API_KEY;
        showApiKeyStatus('Chave padrão carregada', 'var(--primary)');
    }

    saveApiKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('STADA_GEMINI_KEY', key);
            showApiKeyStatus('Salvo no localStorage!', 'var(--success)');
        } else {
            localStorage.removeItem('STADA_GEMINI_KEY');
            apiKeyInput.value = DEFAULT_API_KEY;
            showApiKeyStatus('Restaurado para chave padrão', 'var(--warning)');
        }
    });

    toggleApiKeyBtn.addEventListener('click', () => {
        apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
        eyeIcon.className = apiKeyInput.type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    });

    function showApiKeyStatus(msg, color) {
        apiKeyStatus.textContent = msg;
        apiKeyStatus.style.color = color;
        setTimeout(() => { apiKeyStatus.textContent = ''; }, 3000);
    }

    // Drag and Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eName => {
        dropzone.addEventListener(eName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
    });

    ['dragenter', 'dragover'].forEach(eName => {
        dropzone.addEventListener(eName, () => dropzone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eName => {
        dropzone.addEventListener(eName, () => dropzone.classList.remove('dragover'), false);
    });

    dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function handleFiles(files) {
        if (!files || files.length === 0) return;
        const file = files[0];

        if (file.size > 20 * 1024 * 1024) {
            showError('O arquivo excede o limite máximo de 20MB.');
            return;
        }

        currentFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
        fileTypeIcon.className = file.type === 'application/pdf' ? 'fa-solid fa-file-pdf file-icon' : 'fa-solid fa-file-image file-icon';

        fileInfoCard.classList.remove('hidden');
        hideError();

        if (fileBlobUrl) URL.revokeObjectURL(fileBlobUrl);
        fileBlobUrl = URL.createObjectURL(file);
        loadInViewer(fileBlobUrl, file.type, 1);

        const reader = new FileReader();
        reader.onload = () => {
            fileArrayBuffer = reader.result;
        };
        reader.readAsArrayBuffer(file);
    }

    function loadInViewer(url, mimeType, page = 1) {
        viewerPlaceholder.classList.add('hidden');
        currentPageIndicator.textContent = `Página ${page}`;

        if (mimeType === 'application/pdf') {
            imageViewer.classList.add('hidden');
            pdfIframe.classList.remove('hidden');
            pdfIframe.src = `${url}#page=${page}`;
        } else {
            pdfIframe.classList.add('hidden');
            imageViewer.classList.remove('hidden');
            imageViewer.src = url;
        }
    }

    // Conversão rápida de PDF em imagens comprimidas via PDF.js antes de enviar ao Gemini
    async function convertPdfToOptimizedImages(arrayBuffer) {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;
        const imagesBase64 = [];

        const maxPages = Math.min(pdfDoc.numPages, 15);

        for (let i = 1; i <= maxPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 1.2 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const base64Data = canvas.toDataURL('image/jpeg', 0.75).split(',')[1];
            imagesBase64.push({
                inline_data: {
                    mime_type: "image/jpeg",
                    data: base64Data
                }
            });
        }
        return imagesBase64;
    }

    // Acionar Auditoria via Gemini API
    analyzeBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim() || DEFAULT_API_KEY;

        if (!fileArrayBuffer || !currentFile) {
            showError('Selecione um arquivo válido antes de analisar.');
            return;
        }

        setLoading(true, 'Convertendo e compactando páginas para análise rápida...');
        hideError();
        resultsContainer.classList.add('hidden');

        try {
            let contentsParts = [];

            const systemPrompt = `
            Você é o auditor sênior de análise cadastral e de crédito do STADA Pro.
            Analise o lote de documentos e extraia com extrema precisão os dados cadastrais, financeiros e de validação.

            REGRAS MANDATÓRIAS PARA COMPROVANTE DE ENDEREÇO:
            1. [PROPRIO]: No nome da própria pessoa.
            2. [CONJUGE_VALIDADO]: No nome de terceiro, mas existe Certidão de Casamento no lote ligando ao titular.
            3. [PAIS_VALIDADO]: No nome de terceiro, mas documentos comprovam ser pai/mãe.
            4. [NOME_TERCEIRO_INVALIDO]: Nome de terceiro sem vínculo no lote.
            5. [AUSENTE]: Sem comprovante.

            REGRAS CRÍTICAS DE RENDA E COMPROVAÇÃO:
            - HOLERITES E VÍNCULO CLT: Se o cliente NÃO possui registro ativo na carteira de trabalho (CTPS) ou atua como autônomo/empresário/aposentado, NÃO exija holerites e marque "documentos_obrigatorios_presentes.comprovante_renda" como true se houver outra forma de comprovação válida.
            - COMPROVAÇÃO POR IRPF: Caso o comprovante de renda apresentado seja o IRPF (Imposto de Renda), é OBRIGATÓRIA a apresentação de extratos bancários de pelo menos os últimos 3 meses. A movimentação financeira nesses extratos deve ser compatível com os rendimentos declarados no IRPF. Se o IRPF estiver presente mas faltarem os extratos bancários, aponte inconsistência no cross-check e marque a renda como pendente de validação.

            Extraia todos os dados cadastrais solicitados no esquema JSON, faça o cross-check de divergências e calcule rendas e FGTS.
            `;

            contentsParts.push({ text: systemPrompt });

            if (currentFile.type === 'application/pdf') {
                const optimizedImages = await convertPdfToOptimizedImages(fileArrayBuffer);
                contentsParts.push(...optimizedImages);
            } else {
                const base64Img = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(currentFile);
                });
                contentsParts.push({
                    inline_data: {
                        mime_type: currentFile.type,
                        data: base64Img
                    }
                });
            }

            setLoading(true, 'A IA está auditando temporalidade, rendas, IRPF e consistências...');
            const result = await callGeminiApi(apiKey, contentsParts);
            lastAnalysisResult = result;
            renderResults(result);
        } catch (err) {
            showError('Falha na análise: ' + err.message);
        } finally {
            setLoading(false);
        }
    });

    async function callGeminiApi(apiKey, parts) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const jsonSchema = {
            type: "OBJECT",
            properties: {
                resumo_executivo: { type: "STRING" },
                total_pessoas_identificadas: { type: "INTEGER" },
                pessoas: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            id_pessoa: { type: "STRING" },
                            nome_pessoa: { type: "STRING" },
                            cpf: { type: "STRING" },
                            dados_cadastrais: {
                                type: "OBJECT",
                                properties: {
                                    nome_completo: { type: "STRING" },
                                    cpf: { type: "STRING" },
                                    rg_numero: { type: "STRING" },
                                    rg_orgao_emissor: { type: "STRING" },
                                    rg_data_expedicao: { type: "STRING" },
                                    data_nascimento: { type: "STRING" },
                                    estado_civil: { type: "STRING" },
                                    nome_mae: { type: "STRING" },
                                    pis_pasep: { type: "STRING" }
                                }
                            },
                            validacao_temporalidade: {
                                type: "OBJECT",
                                properties: {
                                    endereco_valido_90d: { type: "BOOLEAN" },
                                    holerites_ultimos_3m: { type: "BOOLEAN" },
                                    rg_cnh_valido: { type: "BOOLEAN" },
                                    alertas_temporalidade: { type: "ARRAY", items: { type: "STRING" } }
                                }
                            },
                            resumo_financeiro: {
                                type: "OBJECT",
                                properties: {
                                    regime_trabalho: { type: "STRING" },
                                    renda_bruta_media: { type: "NUMBER" },
                                    renda_liquida_media: { type: "NUMBER" },
                                    observacoes_renda: { type: "STRING" }
                                }
                            },
                            inconsistencias_cross_check: {
                                type: "ARRAY",
                                items: { type: "STRING" }
                            },
                            fgts_info: {
                                type: "OBJECT",
                                properties: {
                                    possui_extrato_fgts: { type: "BOOLEAN" },
                                    saldo_total_fgts: { type: "NUMBER" },
                                    mais_de_3_anos_fgts: { type: "BOOLEAN" },
                                    observacoes_fgts: { type: "STRING" }
                                }
                            },
                            status_comprovante_endereco: { 
                                type: "STRING",
                                enum: ["PROPRIO", "CONJUGE_VALIDADO", "PAIS_VALIDADO", "NOME_TERCEIRO_INVALIDO", "AUSENTE"]
                            },
                            titular_comprovante_endereco: { type: "STRING" },
                            comprovante_endereco_valido: { type: "BOOLEAN" },
                            documentos_obrigatorios_presentes: {
                                type: "OBJECT",
                                properties: {
                                    rg_cpf_cnh: { type: "BOOLEAN" },
                                    certidao_estado_civil: { type: "BOOLEAN" },
                                    comprovante_endereco: { type: "BOOLEAN" },
                                    comprovante_renda: { type: "BOOLEAN" },
                                    carteira_trabalho: { type: "BOOLEAN" }
                                },
                                required: ["rg_cpf_cnh", "certidao_estado_civil", "comprovante_endereco", "comprovante_renda", "carteira_trabalho"]
                            },
                            requer_revisao_humana: { type: "BOOLEAN" },
                            motivos_revisao: { type: "ARRAY", items: { type: "STRING" } },
                            documentos_encontrados: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        tipo_documento: { type: "STRING" },
                                        nome_titular_impresso: { type: "STRING" },
                                        pagina: { type: "INTEGER" },
                                        qualidade: { type: "STRING" }
                                    },
                                    required: ["tipo_documento", "pagina", "qualidade"]
                                }
                            }
                        },
                        required: ["nome_pessoa", "dados_cadastrais", "validacao_temporalidade", "resumo_financeiro", "status_comprovante_endereco", "comprovante_endereco_valido", "documentos_obrigatorios_presentes", "requer_revisao_humana", "motivos_revisao", "documentos_encontrados"]
                    }
                }
            },
            required: ["resumo_executivo", "total_pessoas_identificadas", "pessoas"]
        };

        const payload = {
            contents: [{ parts: parts }],
            generationConfig: {
                response_mime_type: "application/json",
                response_schema: jsonSchema,
                temperature: 0.1
            }
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || `Erro na API (${response.status})`);
        }

        const data = await response.json();
        return JSON.parse(data.candidates[0].content.parts[0].text);
    }

    // Renderização dos resultados
    function renderResults(data) {
        resumoExecutivoText.textContent = data.resumo_executivo;
        totalPessoasCount.textContent = data.total_pessoas_identificadas;
        pessoasCardsList.innerHTML = '';

        data.pessoas.forEach((p, index) => {
            const card = document.createElement('div');
            card.className = 'card-pessoa';

            const statusClass = p.requer_revisao_humana ? 'badge-warning' : 'badge-success';
            const statusText = p.requer_revisao_humana ? 'Requer Revisão' : 'Aprovado Automático';

            const c = p.dados_cadastrais || {};
            const temp = p.validacao_temporalidade || {};
            const fin = p.resumo_financeiro || {};
            const fgts = p.fgts_info || {};
            const cross = p.inconsistencias_cross_check || [];

            let enderecoBadgeClass = 'badge-danger';
            let enderecoTextoStatus = p.status_comprovante_endereco;

            if (['PROPRIO', 'CONJUGE_VALIDADO', 'PAIS_VALIDADO'].includes(p.status_comprovante_endereco)) {
                enderecoBadgeClass = 'badge-success';
            } else if (p.status_comprovante_endereco === 'NOME_TERCEIRO_INVALIDO') {
                enderecoBadgeClass = 'badge-danger';
                enderecoTextoStatus = 'INVÁLIDO (Terceiro sem vínculo)';
            } else {
                enderecoBadgeClass = 'badge-warning';
            }

            card.innerHTML = `
                <div class="card-header">
                    <div>
                        <strong>${p.nome_pessoa}</strong>
                        <span class="badge badge-info" style="margin-left:8px;">${fin.regime_trabalho || 'Regime N/I'}</span>
                    </div>
                    <span class="badge ${statusClass}">${statusText}</span>
                </div>

                <div class="section-title"><i class="fa-solid fa-address-card"></i> Dados Cadastrais (Clique para Copiar)</div>
                <div class="data-grid">
                    <div class="data-field">Nome: <strong>${c.nome_completo || '-'}</strong> ${createCopyBtn(c.nome_completo)}</div>
                    <div class="data-field">CPF: <strong>${c.cpf || '-'}</strong> ${createCopyBtn(c.cpf)}</div>
                    <div class="data-field">RG: <strong>${c.rg_numero || '-'}</strong> ${createCopyBtn(c.rg_numero)}</div>
                    <div class="data-field">Órgão/Emissão: <strong>${c.rg_orgao_emissor || '-'} (${c.rg_data_expedicao || '-'})</strong></div>
                    <div class="data-field">Nascimento: <strong>${c.data_nascimento || '-'}</strong> ${createCopyBtn(c.data_nascimento)}</div>
                    <div class="data-field">Mãe: <strong>${c.nome_mae || '-'}</strong> ${createCopyBtn(c.nome_mae)}</div>
                    <div class="data-field">Estado Civil: <strong>${c.estado_civil || '-'}</strong></div>
                    <div class="data-field">PIS/PASEP: <strong>${c.pis_pasep || '-'}</strong> ${createCopyBtn(c.pis_pasep)}</div>
                </div>

                <div class="section-title"><i class="fa-solid fa-calculator"></i> Apuração Financeira e FGTS</div>
                <div class="data-grid" style="background:#f0fdf4; border-color:#bbf7d0;">
                    <div class="data-field">Renda Bruta Média: <strong>R$ ${(fin.renda_bruta_media || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong> ${createCopyBtn(fin.renda_bruta_media)}</div>
                    <div class="data-field">Renda Líquida Média: <strong>R$ ${(fin.renda_liquida_media || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong> ${createCopyBtn(fin.renda_liquida_media)}</div>
                    <div class="data-field">Saldo FGTS: <strong>R$ ${(fgts.saldo_total_fgts || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong></div>
                    <div class="data-field">+3 Anos FGTS: <strong>${fgts.mais_de_3_anos_fgts ? 'SIM ✅' : 'NÃO/NÃO IDENTIFICADO'}</strong></div>
                </div>

                ${(temp.alertas_temporalidade && temp.alertas_temporalidade.length > 0) ? `
                    <div class="alert-box alert-warning">
                        <strong><i class="fa-solid fa-clock"></i> Alertas de Temporalidade:</strong>
                        <ul style="margin-left:15px;">${temp.alertas_temporalidade.map(a => `<li>${a}</li>`).join('')}</ul>
                    </div>
                ` : ''}

                ${(cross && cross.length > 0) ? `
                    <div class="alert-box alert-danger">
                        <strong><i class="fa-solid fa-triangle-exclamation"></i> Inconsistências Detectadas (Cross-Check):</strong>
                        <ul style="margin-left:15px;">${cross.map(c => `<li>${c}</li>`).join('')}</ul>
                    </div>
                ` : ''}

                <div class="checklist-grid">
                    <div class="check-item ${p.documentos_obrigatorios_presentes.rg_cpf_cnh ? 'ok' : 'missing'}">
                        <i class="fa-solid ${p.documentos_obrigatorios_presentes.rg_cpf_cnh ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> RG/CPF/CNH
                    </div>
                    <div class="check-item ${p.documentos_obrigatorios_presentes.certidao_estado_civil ? 'ok' : 'missing'}">
                        <i class="fa-solid ${p.documentos_obrigatorios_presentes.certidao_estado_civil ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> Est. Civil
                    </div>
                    <div class="check-item ${p.documentos_obrigatorios_presentes.comprovante_endereco ? 'ok' : 'missing'}">
                        <i class="fa-solid ${p.documentos_obrigatorios_presentes.comprovante_endereco ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> Endereço (${p.status_comprovante_endereco})
                    </div>
                    <div class="check-item ${p.documentos_obrigatorios_presentes.comprovante_renda ? 'ok' : 'missing'}">
                        <i class="fa-solid ${p.documentos_obrigatorios_presentes.comprovante_renda ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> Renda
                    </div>
                    <div class="check-item ${p.documentos_obrigatorios_presentes.carteira_trabalho ? 'ok' : 'missing'}">
                        <i class="fa-solid ${p.documentos_obrigatorios_presentes.carteira_trabalho ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> CTPS
                    </div>
                </div>

                <p style="font-size:12px; margin-top:8px;">
                    <strong>Validação de Endereço:</strong> <span class="badge ${enderecoBadgeClass}">${enderecoTextoStatus}</span>
                    ${p.titular_comprovante_endereco ? `<br><small>Titular impresso: ${p.titular_comprovante_endereco}</small>` : ''}
                </p>

                <h5 style="margin-top:10px; font-size:12px;">Documentos Mapeados:</h5>
                <table class="doc-table">
                    <thead>
                        <tr><th>Tipo Documento</th><th>Qualidade</th><th>Página</th></tr>
                    </thead>
                    <tbody>
                        ${p.documentos_encontrados.map(d => `
                            <tr>
                                <td>${d.tipo_documento}</td>
                                <td>${d.qualidade}</td>
                                <td>
                                    <button class="btn-secondary btn-sm" onclick="window.jumpToPage(${d.pagina})">
                                        <i class="fa-solid fa-eye"></i> Pág. ${d.pagina}
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <!-- Botão Gerar Relatório de Pendências PDF por Cliente -->
                <button class="btn-secondary" style="background:#0284c7; margin-top: 15px; width: 100%;" onclick="window.gerarRelatorioPdfCliente(${index})">
                    <i class="fa-solid fa-file-pdf"></i> Gerar Relatório de Pendências (PDF)
                </button>
            `;

            pessoasCardsList.appendChild(card);
        });

        resultsContainer.classList.remove('hidden');
        globalActions.classList.remove('hidden');
    }

    function createCopyBtn(value) {
        if (!value) return '';
        const cleanValue = String(value).replace(/'/g, "\\'");
        return `<button class="btn-copy" onclick="window.copyToClipboard('${cleanValue}', this)" title="Copiar"><i class="fa-solid fa-copy"></i></button>`;
    }

    window.copyToClipboard = function(text, btnEl) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = btnEl.innerHTML;
            btnEl.innerHTML = '<i class="fa-solid fa-check" style="color:green;"></i>';
            setTimeout(() => { btnEl.innerHTML = originalText; }, 1500);
        });
    };

    window.jumpToPage = function(page) {
        if (fileBlobUrl && currentFile) {
            loadInViewer(fileBlobUrl, currentFile.type, page);
        }
    };

    // Função para gerar o Recibo/Relatório de Pendências em PDF individual do cliente
    window.gerarRelatorioPdfCliente = async function(pessoaIndex) {
        if (!lastAnalysisResult || !lastAnalysisResult.pessoas[pessoaIndex]) return;
        const pessoa = lastAnalysisResult.pessoas[pessoaIndex];

        try {
            setLoading(true, 'Gerando relatório PDF do cliente...');
            const pdfDoc = await PDFLib.PDFDocument.create();
            const page = pdfDoc.addPage([595.28, 841.89]); // Formato A4
            const { width, height } = page.getSize();
            
            const fontTitle = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
            const fontRegular = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

            let yPosition = height - 50;

            // Cabeçalho
            page.drawText('Relatório de Auditoria Cadastral', {
                x: 50,
                y: yPosition,
                size: 16,
                font: fontTitle,
                color: PDFLib.rgb(0.14, 0.39, 0.92)
            });

            yPosition -= 30;
            page.drawText(`Cliente: ${pessoa.nome_pessoa}`, { x: 50, y: yPosition, size: 11, font: fontRegular });
            yPosition -= 18;
            page.drawText(`CPF: ${pessoa.cpf || 'Não informado'}`, { x: 50, y: yPosition, size: 11, font: fontRegular });
            yPosition -= 18;
            page.drawText(`Data da Auditoria: ${new Date().toLocaleDateString('pt-BR')}`, { x: 50, y: yPosition, size: 11, font: fontRegular });
            
            yPosition -= 25;
            page.drawLine({
                start: { x: 50, y: yPosition },
                end: { x: width - 50, y: yPosition },
                thickness: 1,
                color: PDFLib.rgb(0.8, 0.8, 0.8)
            });

            yPosition -= 30;

            // Status Geral
            const statusTexto = pessoa.requer_revisao_humana ? 'STATUS: REQUER REVISÃO / AJUSTES' : 'STATUS: APROVADO NA TRIAGEM INICIAL';
            const statusCor = pessoa.requer_revisao_humana ? PDFLib.rgb(0.85, 0.15, 0.15) : PDFLib.rgb(0.09, 0.64, 0.29);

            page.drawText(statusTexto, { x: 50, y: yPosition, size: 13, font: fontTitle, color: statusCor });
            yPosition -= 35;

            // Checklist de Documentos
            page.drawText('Checklist de Documentos Obrigatórios:', { x: 50, y: yPosition, size: 12, font: fontTitle });
            yPosition -= 20;

            const docs = pessoa.documentos_obrigatorios_presentes || {};
            const docNomes = {
                rg_cpf_cnh: 'RG / CNH / CPF',
                certidao_estado_civil: 'Certidão de Estado Civil',
                comprovante_endereco: `Comprovante de Endereço (${pessoa.status_comprovante_endereco || 'N/A'})`,
                comprovante_renda: 'Comprovante de Renda (Holerites/IR)',
                carteira_trabalho: 'Carteira de Trabalho (CTPS/FGTS)'
            };

            for (const [key, nomeAmigavel] of Object.entries(docNomes)) {
                const presente = docs[key];
                const checkSymbol = presente ? '[OK]' : '[PENDENTE]';
                const corItem = presente ? PDFLib.rgb(0.09, 0.64, 0.29) : PDFLib.rgb(0.85, 0.15, 0.15);

                page.drawText(`${checkSymbol} ${nomeAmigavel}`, { x: 70, y: yPosition, size: 10, font: fontRegular, color: corItem });
                yPosition -= 18;
            }

            // Observações / Motivos de Revisão
            if (pessoa.motivos_revisao && pessoa.motivos_revisao.length > 0) {
                yPosition -= 10;
                page.drawText('Observações / Pendências a Corrigir:', { x: 50, y: yPosition, size: 12, font: fontTitle, color: PDFLib.rgb(0.85, 0.15, 0.15) });
                yPosition -= 20;

                pessoa.motivos_revisao.forEach(motivo => {
                    page.drawText(`- ${motivo}`, { x: 70, y: yPosition, size: 10, font: fontRegular });
                    yPosition -= 15;
                });
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Relatorio_Pendencias_${pessoa.nome_pessoa.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();

        } catch (err) {
            alert('Erro ao gerar relatório PDF do cliente: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Fatiador Paralelo com Geração de ZIP
    fatiarPdfGeralBtn.addEventListener('click', async () => {
        if (!lastAnalysisResult || !fileArrayBuffer || currentFile.type !== 'application/pdf') {
            alert('Esta função está disponível apenas para arquivos no formato PDF.');
            return;
        }

        try {
            setLoading(true, 'Fatiando e empacotando documentos em arquivo ZIP...');
            const srcDoc = await PDFLib.PDFDocument.load(fileArrayBuffer);
            const zip = new JSZip();

            for (const pessoa of lastAnalysisResult.pessoas) {
                const docMap = {};

                pessoa.documentos_encontrados.forEach(d => {
                    if (!docMap[d.tipo_documento]) docMap[d.tipo_documento] = [];
                    docMap[d.tipo_documento].push(d.pagina);
                });

                for (const [tipoDoc, paginas] of Object.entries(docMap)) {
                    const subDoc = await PDFLib.PDFDocument.create();
                    const pageIndexes = paginas.map(p => p - 1).filter(p => p >= 0 && p < srcDoc.getPageCount());
                    if (pageIndexes.length === 0) continue;

                    const copiedPages = await subDoc.copyPages(srcDoc, pageIndexes);
                    copiedPages.forEach(page => subDoc.addPage(page));

                    const subPdfBytes = await subDoc.save();
                    const nomePessoaClean = pessoa.nome_pessoa.replace(/[^a-zA-Z0-9]/g, '_');
                    const nomeArquivo = `${tipoDoc}_${nomePessoaClean}.pdf`;

                    zip.file(nomeArquivo, subPdfBytes);
                }
            }

            const content = await zip.generateAsync({ type: "blob" });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(content);
            a.download = `Documentos_Fatiados_${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            alert('Erro ao gerar ZIP dos PDFs: ' + err.message);
        } finally {
            setLoading(false);
        }
    });

    exportJsonBtn.addEventListener('click', () => {
        if (!lastAnalysisResult) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lastAnalysisResult, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `auditoria_completa_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    });

    function setLoading(isLoading, text = '') {
        if (isLoading) {
            loadingText.textContent = text;
            loadingContainer.classList.remove('hidden');
        } else {
            loadingContainer.classList.add('hidden');
        }
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }
});