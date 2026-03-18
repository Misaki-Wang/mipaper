# cs.AI Daily Paper Classification Report (2026-03-06)

- Source: https://papers.cool/arxiv/cs.AI?date=2026-03-06&show=1000
- Classification: heuristic topic assignment from title keywords
- Classifier: claude
- Total Papers: 2

## Focus Topics

- Generative Foundations: 0 papers (0.00%)
- Multimodal Generative Modeling: 0 papers (0.00%)
- Multimodal Agents: 0 papers (0.00%)

## Topic Distribution Analysis

- LLMs and Language: 1 papers (50.00%)
- Reasoning, Alignment, and Evaluation: 1 papers (50.00%)

### Brief Notes

- The largest topic today is “LLMs and Language”, with 1 papers, accounting for 50.00%。
- The top 3 topics account for 100.00%，concentrated。
- Long-tail topics with only one paper: 2 items。

## LLMs and Language (1 papers, 50.00%)

- [The Spike, the Sparse and the Sink: Anatomy of Massive Activations and Attention Sinks](https://arxiv.org/pdf/2603.05498)
  - Authors: Shangwen Sun, Alfredo Canziani, Yann LeCun, Jiachen Zhu
  - <details>
    <summary>Abstract</summary>

    We study two recurring phenomena in Transformer language models: massive activations, in which a small number of tokens exhibit extreme outliers in a few channels, and attention sinks, in which certain tokens attract disproportionate attention mass regardless of semantic relevance. Prior work observes that these phenomena frequently co-occur and often involve the same tokens, but their functional roles and causal relationship remain unclear. Through systematic experiments, we show that the co-occurrence is largely an architectural artifact of modern Transformer design, and that the two phenomena serve related but distinct functions. Massive activations operate globally: they induce near-constant hidden representations that persist across layers, effectively functioning as implicit parameters of the model. Attention sinks operate locally: they modulate attention outputs across heads and bias individual heads toward short-range dependencies. We identify the pre-norm configuration as the key choice that enables the co-occurrence, and show that ablating it causes the two phenomena to decouple.
    </details>

## Reasoning, Alignment, and Evaluation (1 papers, 50.00%)

- [Towards Provably Unbiased LLM Judges via Bias-Bounded Evaluation](https://arxiv.org/pdf/2603.05485)
  - Authors: Benjamin Feuer, Lucas Rosenblatt, Oussama Elachqar
  - <details>
    <summary>Abstract</summary>

    As AI models progress beyond simple chatbots into more complex workflows, we draw ever closer to the event horizon beyond which AI systems will be utilized in autonomous, self-maintaining feedback loops. Any autonomous AI system will depend on automated, verifiable rewards and feedback; in settings where ground truth is sparse or non-deterministic, one practical source of such rewards is an LLM-as-a-Judge. Although LLM judges continue to improve, the literature has yet to introduce systems capable of enforcing standards with strong guarantees, particularly when bias vectors are unknown or adversarially discovered. To remedy this issue, we propose average bias-boundedness (A-BB), an algorithmic framework which formally guarantees reductions of harm/impact as a result of any measurable bias in an LLM judge. Evaluating on Arena-Hard-Auto with four LLM judges, we achieve (tau=0.5, delta=0.01) bias-bounded guarantees while retaining 61-99% correlation with original rankings across formatting and schematic bias settings, with most judge-bias combinations exceeding 80%. The code to reproduce our findings is available at https://github.com/penfever/bias-bounded-evaluation.
    </details>
