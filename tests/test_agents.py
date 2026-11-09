from __future__ import annotations

import sys
import types

from stringlab.agents import AgentBridge
from stringlab.physics import template


class DummyMemory:
    def __init__(self):
        self.data={};self.messages=[]
    def set(self,key,value,ttl=None):
        self.data[key]=value
    def publish(self,channel,value):
        self.messages.append((channel,value))


def test_published_diagnostics_are_bounded_revision_aware(monkeypatch):
    root=types.ModuleType('src');root.__path__=[]
    agentpkg=types.ModuleType('src.agents');agentpkg.__path__=[]
    coll=types.ModuleType('src.agents.collaborative');coll.__path__=[]
    shared=types.ModuleType('src.agents.collaborative.shared_memory');shared.SharedMemory=DummyMemory
    for mod in (root,agentpkg,coll,shared):monkeypatch.setitem(sys.modules,mod.__name__,mod)
    bridge=AgentBridge()
    a=bridge.publish_result(template('open'),0.,2)
    b=bridge.publish_result(template('open'),0.,3)
    assert a['published'] and b['published']
    assert len(bridge._memory.data)==2
    assert a['result']['revision']==2
    assert 'geometry' not in a['result']
    assert a['result']['configuration_sha256']==b['result']['configuration_sha256']


def test_explicit_agent_factory_delegation_does_not_apply_changes(monkeypatch):
    root=types.ModuleType('src');root.__path__=[]
    agentpkg=types.ModuleType('src.agents');agentpkg.__path__=[]
    coll=types.ModuleType('src.agents.collaborative');coll.__path__=[]
    shared=types.ModuleType('src.agents.collaborative.shared_memory');shared.SharedMemory=DummyMemory
    factory=types.ModuleType('src.agents.agent_factory')
    class DummyAgent:
        def perform_task(self,request):
            return {'accepted_context':request['stringlab_context'],'operation':request['operation']}
    class DummyFactory:
        def create_agent(self,agent_type,shared_memory=None):
            assert agent_type=='stem' and shared_memory is not None
            return DummyAgent()
    factory.AgentFactory=DummyFactory
    for mod in (root,agentpkg,coll,shared,factory):monkeypatch.setitem(sys.modules,mod.__name__,mod)
    bridge=AgentBridge()
    out=bridge.run({'agent':'stem','revision':4,'configuration':template('open'),
                    'task':{'operation':'probe'}})
    assert out['result']['operation']=='probe'
    assert out['context']['revision']==4
    assert not out['applied_parameter_changes']
