import unittest

from cool_paper.topics import classify_title


class TopicClassifierTest(unittest.TestCase):
    def test_agent_titles_map_to_agents_topic(self) -> None:
        topic_key, topic_label, _ = classify_title(
            "Building AI Coding Agents for the Terminal: Scaffolding, Harness, Context Engineering, and Lessons Learned"
        )
        self.assertEqual("agents_planning", topic_key)
        self.assertEqual("通用智能体与规划", topic_label)

    def test_evaluation_titles_beat_generic_llm_bucket(self) -> None:
        topic_key, topic_label, _ = classify_title(
            "Towards Provably Unbiased LLM Judges via Bias-Bounded Evaluation"
        )
        self.assertEqual("reasoning_alignment_eval", topic_key)
        self.assertEqual("推理、对齐与评测", topic_label)

    def test_dataset_titles_map_to_dataset_bucket(self) -> None:
        topic_key, topic_label, _ = classify_title(
            "WebChain: A Large-Scale Human-Annotated Dataset of Real-World Web Interaction Traces"
        )
        self.assertEqual("datasets_benchmarks", topic_key)
        self.assertEqual("数据集与基准", topic_label)

    def test_compound_llm_tokens_still_map_to_llm_bucket(self) -> None:
        topic_key, topic_label, _ = classify_title(
            "Measuring the Redundancy of Decoder Layers in SpeechLLMs"
        )
        self.assertEqual("llm_language", topic_key)
        self.assertEqual("大模型与语言", topic_label)

    def test_misalignment_titles_map_to_reasoning_bucket(self) -> None:
        topic_key, topic_label, _ = classify_title(
            "Semantic Containment as a Fundamental Property of Emergent Misalignment"
        )
        self.assertEqual("reasoning_alignment_eval", topic_key)
        self.assertEqual("推理、对齐与评测", topic_label)

    def test_theoretical_generative_titles_map_to_focus_bucket(self) -> None:
        topic_key, topic_label, _ = classify_title(
            "Understanding Diffusion Generalization via a Theoretical Analysis of Score Matching"
        )
        self.assertEqual("generative_foundations", topic_key)
        self.assertEqual("生成模型理论基础", topic_label)

    def test_multimodal_generation_titles_map_to_focus_bucket(self) -> None:
        topic_key, topic_label, _ = classify_title(
            "Multimodal Diffusion Transformers for Unified Video and Audio Generation"
        )
        self.assertEqual("multimodal_generative", topic_key)
        self.assertEqual("多模态生成建模", topic_label)

    def test_text_driven_generation_titles_map_to_multimodal_generation(self) -> None:
        topic_key, topic_label, _ = classify_title(
            "RelaxFlow: Text-Driven Amodal 3D Generation"
        )
        self.assertEqual("multimodal_generative", topic_key)
        self.assertEqual("多模态生成建模", topic_label)

    def test_multimodal_agent_titles_map_to_focus_bucket(self) -> None:
        topic_key, topic_label, _ = classify_title(
            "Vision-Language-Action Agents for Long-Horizon Robotic Manipulation"
        )
        self.assertEqual("multimodal_agents", topic_key)
        self.assertEqual("多模态智能体", topic_label)

    def test_multimodal_non_generative_title_does_not_hit_multimodal_generation(self) -> None:
        topic_key, topic_label, _ = classify_title(
            "A Multimodal Benchmark for Visual Reasoning and Structured Understanding"
        )
        self.assertNotEqual("multimodal_generative", topic_key)
        self.assertIn(topic_label, {"数据集与基准", "多模态理解与视觉"})

    def test_generative_ai_application_title_does_not_hit_generative_foundations(self) -> None:
        topic_key, _, _ = classify_title(
            "Training for Technology: Adoption and Productive Use of Generative AI in Legal Analysis"
        )
        self.assertNotEqual("generative_foundations", topic_key)


if __name__ == "__main__":
    unittest.main()
